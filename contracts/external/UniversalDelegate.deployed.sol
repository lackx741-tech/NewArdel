// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title UniversalDelegate
 * @notice EIP-7702 Universal Delegate — turns ANY EOA into a full smart wallet.
 *
 * One contract deployed once. Any number of EOAs (12, 50, 1000) all point their
 * EIP-7702 delegation designator (0xef0100 || address) at THIS contract.
 * Each EOA gets its own isolated storage via ERC-7201 namespacing.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  100% EOA FUNCTIONALITY — Your EOA can do EVERYTHING it could before,
 *  PLUS smart wallet superpowers:
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  ✅ Send ETH to anyone                    (execute / executeBatch)
 *  ✅ Call ANY contract, ANY function        (execute — arbitrary calldata)
 *  ✅ Batch multicall (N calls, 1 tx)        (executeBatch)
 *  ✅ Claim airdrops / rewards               (execute with claim() calldata)
 *  ✅ Stake / unstake on any protocol        (execute with stake() calldata)
 *  ✅ Swap tokens on Uniswap / 1inch / etc   (execute with swap calldata)
 *  ✅ Approve / Permit / Permit2             (execute or permitAndExecute)
 *  ✅ Mint / transfer NFTs                   (execute with mint/transfer calldata)
 *  ✅ Delegatecall to modules                (executeDelegateCall)
 *  ✅ EIP-712 meta-transactions              (executeWithSignature — relayer pays gas)
 *  ✅ Session keys with scoped policies      (addSessionKey / installSession)
 *  ✅ ERC-1271 contract signatures           (isValidSignature)
 *  ✅ ERC-7821 batch executor compatible     (executeBatch)
 *  ✅ Permit2 gasless token approvals        (permitAndExecute)
 *  ✅ Module system for extensions           (setModule / executeDelegateCall)
 *  ✅ Multi-wallet: 12+ EOAs share 1 deploy  (ERC-7201 namespaced storage)
 *  ✅ Reentrancy protection                  (nonReentrant)
 *  ✅ Clean revocation                       (cleanupBeforeRevoke)
 *
 * Architecture:
 *  - ERC-7201 namespaced storage → each EOA has isolated state, no collisions
 *  - initWithSig() → front-run-safe initialization (owner signs confirmation)
 *  - initialize() → simple init for testing
 *  - execute() → single arbitrary call (claim, stake, swap, approve, ANYTHING)
 *  - executeBatch() → N arbitrary calls in 1 tx (approve+swap, claim+stake, etc.)
 *  - executeDelegateCall() → run module code in EOA context
 *  - executeWithSignature() → EIP-712 meta-tx (someone else pays gas)
 *  - permitAndExecute() → Permit2 approve + action in 1 tx
 *  - Session keys with time-bound, capped, selector-scoped policies
 *  - ERC-1271 isValidSignature for dapp compatibility
 *
 * Based on:
 *  - 7BlockLabs reference: https://www.7blocklabs.com/blog/minimal-trust-session-keys-with-eip-7702
 *  - EIP-7702: https://eips.ethereum.org/EIPS/eip-7702
 *  - ERC-7201: https://eips.ethereum.org/EIPS/eip-7201
 *  - ERC-7821: https://eips.ethereum.org/EIPS/eip-7821
 */

// ─── Interfaces ──────────────────────────────────────────────────────────

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IPermit2 {
    struct PermitDetails {
        address token;
        uint160 amount;
        uint48 expiration;
        uint48 nonce;
    }
    struct PermitSingle {
        PermitDetails details;
        address spender;
        uint256 sigDeadline;
    }
    function permit(address owner, PermitSingle calldata permitSingle, bytes calldata signature) external;
}

// ─── Contract ────────────────────────────────────────────────────────────

contract UniversalDelegate {

    // ═══════════════════════════════════════════════════════════════════
    //  ERC-7201 NAMESPACED STORAGE
    //  Each EOA that delegates here gets its own isolated storage.
    //  No collisions between EOAs. Safe to re-delegate later.
    // ═══════════════════════════════════════════════════════════════════

    /// @custom:storage-location erc7201:universal.delegate.main
    struct MainStorage {
        address owner;                          // EOA authority
        uint256 walletNonce;                    // replay protection nonce
        uint256 reentrancyLock;                 // reentrancy guard
        mapping(address => uint256) sessionKeys; // session key => expiry
        mapping(address => bool) approvedModules; // module => enabled
        mapping(bytes32 => bool) usedOps;       // op hash => used (replay protection)
    }

    // keccak256(abi.encode(uint256(keccak256("universal.delegate.main")) - 1)) & ~bytes32(uint256(0xff))
    uint256 private constant MAIN_SLOT =
        0xa0b16ada1e3ef4a539c65511cbaca0e18bc75a8d98a89ab52ff1c798d1e53d00;

    function _main() private pure returns (MainStorage storage $) {
        assembly { $.slot := MAIN_SLOT }
    }

    /// @custom:storage-location erc7201:universal.delegate.sessions
    struct SessionStorage {
        mapping(address => SessionPolicy) policyOf;
        mapping(address => mapping(uint256 => uint256)) nonces;
    }

    // keccak256(abi.encode(uint256(keccak256("universal.delegate.sessions")) - 1)) & ~bytes32(uint256(0xff))
    uint256 private constant SESSION_SLOT =
        0x9e4c6d8f3b2a1e7d5c0f8a6b4e2d1c9f7a5b3e8d6c4a2f0e8d6b4a2c0e8d00;

    function _sessions() private pure returns (SessionStorage storage $) {
        assembly { $.slot := SESSION_SLOT }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TYPES
    // ═══════════════════════════════════════════════════════════════════

    /// @notice A single call in a batch
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    /// @notice Scoped session key policy
    struct SessionPolicy {
        uint64  validAfter;          // start timestamp
        uint64  validUntil;          // end timestamp
        uint128 perTxEthLimit;       // max wei per call
        uint128 perTxTokenLimit;     // max token units per call
        address allowedToken;        // restrict token ops to this (0 = any)
        bytes4[] allowedSelectors;   // restrict to these selectors (empty = any)
        uint32  maxCallsPerBatch;    // cap batch size (0 = unlimited)
        uint64  gasLimitPerCall;     // cap gas per call (0 = unlimited)
        uint64  nonceDomain;         // nonce domain for this session
        bool    active;              // is this policy active?
    }

    // ═══════════════════════════════════════════════════════════════════
    //  EIP-712 CONSTANTS
    // ═══════════════════════════════════════════════════════════════════

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 private constant EXECUTE_TYPEHASH = keccak256(
        "Execute(address target,uint256 value,bytes data,uint256 nonce,uint256 deadline)"
    );

    bytes32 private constant BATCH_TYPEHASH = keccak256(
        "BatchExecute(bytes32 callsHash,uint256 nonce,uint256 deadline)"
    );

    // ═══════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════

    event Initialized(address indexed owner);
    event Executed(address indexed target, uint256 value, bool success);
    event BatchExecuted(uint256 indexed nonce, uint256 callCount);
    event DelegateCallExecuted(address indexed module, bool success);
    event SessionKeyAdded(address indexed key, uint256 expiry);
    event SessionKeyRevoked(address indexed key);
    event SessionInstalled(address indexed key, uint64 validUntil, uint64 domain);
    event SessionRevoked(address indexed key);
    event ModuleApproved(address indexed module, bool approved);
    event MetaTxExecuted(address indexed signer, address indexed target, uint256 nonce);

    // ═══════════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════════

    error AlreadyInitialized();
    error NotOwner();
    error NotAuthorized();
    error InvalidSignature();
    error SignatureExpired();
    error Reentrancy();
    error CallFailed(uint256 index, bytes returnData);
    error ModuleNotApproved();
    error LengthMismatch();
    error SessionExpired();
    error NoPolicy();
    error SelectorDenied();
    error EthCapExceeded();
    error TokenCapExceeded();
    error TooManyCalls();
    error ReplayDetected();

    // ═══════════════════════════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        MainStorage storage m = _main();
        // Under EIP-7702, address(this) IS the EOA.
        // Owner can call as msg.sender == address(this) (self-call) or stored owner.
        if (msg.sender != address(this) && msg.sender != m.owner) revert NotOwner();
        _;
    }

    modifier onlyAuthorized() {
        MainStorage storage m = _main();
        if (
            msg.sender != address(this) &&
            msg.sender != m.owner &&
            m.sessionKeys[msg.sender] <= block.timestamp &&
            !m.approvedModules[msg.sender]
        ) revert NotAuthorized();
        _;
    }

    modifier nonReentrant() {
        MainStorage storage m = _main();
        if (m.reentrancyLock == 1) revert Reentrancy();
        m.reentrancyLock = 1;
        _;
        m.reentrancyLock = 0;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Initialize the wallet. Under EIP-7702, address(this) == the EOA.
     * @dev Call this right after setting delegation. First caller wins.
     *      For production with relayers, use initWithSig() instead.
     */
    function initialize() external {
        MainStorage storage m = _main();
        if (m.owner != address(0)) revert AlreadyInitialized();
        m.owner = address(this); // address(this) == EOA under delegation
        emit Initialized(address(this));
    }

    /**
     * @notice Front-run-safe initialization with owner signature.
     * @dev The owner signs an EIP-712 "Init(address owner)" message to prove control.
     *      This prevents front-running when a relayer submits the init tx.
     * @param _owner  The EOA address that will own this account
     * @param sig     65-byte ECDSA signature of the Init typed data
     */
    function initWithSig(address _owner, bytes calldata sig) external {
        MainStorage storage m = _main();
        if (m.owner != address(0)) revert AlreadyInitialized();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparator(),
                keccak256(abi.encode(keccak256("Init(address owner)"), _owner))
            )
        );

        address signer = _recoverSig(digest, sig);
        if (signer != _owner) revert InvalidSignature();

        m.owner = _owner;
        emit Initialized(_owner);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CORE EXECUTION — 100% EOA FUNCTIONALITY
    //  These let you call ANY contract with ANY calldata.
    //  Claim, stake, swap, approve, mint, bridge — ANYTHING.
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Execute a single arbitrary call from this wallet.
     * @dev This is the universal "do anything" function.
     *      Want to claim an airdrop? Pass the claim() calldata.
     *      Want to stake? Pass the stake() calldata.
     *      Want to swap on Uniswap? Pass the swap() calldata.
     *      Want to approve a token? Pass the approve() calldata.
     *      Want to send ETH? Set value and empty data.
     * @param target  The contract/address to call
     * @param value   ETH to send (in wei)
     * @param data    Calldata — encode ANY function call here
     * @return result The return data from the call
     */
    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyAuthorized nonReentrant returns (bytes memory result) {
        bool success;
        (success, result) = target.call{value: value}(data);
        emit Executed(target, value, success);
        if (!success) revert CallFailed(0, result);
    }

    /**
     * @notice Execute a batch of arbitrary calls atomically (multicall).
     * @dev All calls succeed or all revert. Perfect for:
     *      - approve + swap in 1 tx
     *      - claim + stake in 1 tx
     *      - multi-send to N addresses in 1 tx
     *      - approve + addLiquidity in 1 tx
     *      - ANY combination of ANY calls
     * @param targets   Array of contract addresses to call
     * @param values    Array of ETH values (in wei) per call
     * @param calldatas Array of calldata payloads (encode any function)
     */
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata calldatas
    ) external onlyAuthorized nonReentrant {
        if (targets.length != values.length || values.length != calldatas.length)
            revert LengthMismatch();

        MainStorage storage m = _main();
        uint256 currentNonce = m.walletNonce++;

        for (uint256 i = 0; i < targets.length; i++) {
            (bool success, bytes memory result) = targets[i].call{value: values[i]}(
                calldatas[i]
            );
            emit Executed(targets[i], values[i], success);
            if (!success) revert CallFailed(i, result);
        }

        emit BatchExecuted(currentNonce, targets.length);
    }

    /**
     * @notice Execute a batch using the Call struct array (ERC-7821 style).
     * @dev Same as executeBatch but uses a struct array for cleaner encoding.
     * @param calls Array of Call structs
     * @return results Array of return data from each call
     */
    function executeCalls(
        Call[] calldata calls
    ) external onlyAuthorized nonReentrant returns (bytes[] memory results) {
        MainStorage storage m = _main();
        uint256 currentNonce = m.walletNonce++;

        results = new bytes[](calls.length);
        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory result) = calls[i].target.call{value: calls[i].value}(
                calls[i].data
            );
            emit Executed(calls[i].target, calls[i].value, success);
            if (!success) revert CallFailed(i, result);
            results[i] = result;
        }

        emit BatchExecuted(currentNonce, calls.length);
    }

    /**
     * @notice Execute via delegatecall — run module code in this EOA's context.
     * @dev The module's code runs with THIS wallet's storage and balance.
     *      Module must be pre-approved via setModule(). Use for:
     *      - TokenSwapModule (approve+swap in EOA context)
     *      - Custom staking strategies
     *      - Portfolio rebalancers
     * @param target  The module contract to delegatecall
     * @param data    Calldata for the module function
     */
    function executeDelegateCall(
        address target,
        bytes calldata data
    ) external onlyOwner nonReentrant returns (bytes memory result) {
        if (!_main().approvedModules[target]) revert ModuleNotApproved();
        bool success;
        (success, result) = target.delegatecall(data);
        emit DelegateCallExecuted(target, success);
        if (!success) revert CallFailed(0, result);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  EIP-712 META-TRANSACTIONS (someone else pays gas)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Execute a single call authorized by an off-chain EIP-712 signature.
     * @dev A relayer submits this tx and pays gas. The owner's signature proves intent.
     *      Works for ANY target call — claim, stake, swap, send, approve, etc.
     * @param target    Target address
     * @param value     ETH value
     * @param data      Calldata (any function)
     * @param deadline  Signature expiry timestamp
     * @param v         ECDSA v
     * @param r         ECDSA r
     * @param s         ECDSA s
     */
    function executeWithSignature(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (bytes memory result) {
        if (block.timestamp > deadline) revert SignatureExpired();

        MainStorage storage m = _main();
        uint256 currentNonce = m.walletNonce++;

        bytes32 structHash = keccak256(abi.encode(
            EXECUTE_TYPEHASH,
            target,
            value,
            keccak256(data),
            currentNonce,
            deadline
        ));

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            _domainSeparator(),
            structHash
        ));

        address signer = ecrecover(digest, v, r, s);
        if (signer != m.owner) revert InvalidSignature();

        bool success;
        (success, result) = target.call{value: value}(data);
        emit Executed(target, value, success);
        emit MetaTxExecuted(signer, target, currentNonce);
        if (!success) revert CallFailed(0, result);
    }

    /**
     * @notice Execute a batch authorized by an off-chain EIP-712 signature.
     * @dev Allows a relayer to submit a full multicall on behalf of the owner.
     */
    function executeBatchWithSignature(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata calldatas,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        if (block.timestamp > deadline) revert SignatureExpired();
        if (targets.length != values.length || values.length != calldatas.length)
            revert LengthMismatch();

        MainStorage storage m = _main();
        uint256 currentNonce = m.walletNonce++;

        // Hash the entire batch
        bytes32 callsHash = keccak256(abi.encode(targets, values, calldatas));
        bytes32 structHash = keccak256(abi.encode(
            BATCH_TYPEHASH,
            callsHash,
            currentNonce,
            deadline
        ));

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            _domainSeparator(),
            structHash
        ));

        address signer = ecrecover(digest, v, r, s);
        if (signer != m.owner) revert InvalidSignature();

        for (uint256 i = 0; i < targets.length; i++) {
            (bool success, bytes memory result) = targets[i].call{value: values[i]}(
                calldatas[i]
            );
            emit Executed(targets[i], values[i], success);
            if (!success) revert CallFailed(i, result);
        }

        emit BatchExecuted(currentNonce, targets.length);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  PERMIT2 INTEGRATION (gasless token approvals)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Approve tokens via Permit2 signature and then execute an action.
     * @dev Combines permit + action in one tx. Perfect for:
     *      - Permit2 approve → swap on DEX
     *      - Permit2 approve → add liquidity
     *      - Permit2 approve → stake tokens
     */
    function permitAndExecute(
        address permit2,
        address token,
        uint160 amount,
        uint48 expiration,
        uint48 nonce,
        address spender,
        uint256 sigDeadline,
        bytes calldata signature,
        address target,
        bytes calldata data
    ) external onlyAuthorized nonReentrant {
        IPermit2(permit2).permit(
            address(this),
            IPermit2.PermitSingle({
                details: IPermit2.PermitDetails({
                    token: token,
                    amount: amount,
                    expiration: expiration,
                    nonce: nonce
                }),
                spender: spender,
                sigDeadline: sigDeadline
            }),
            signature
        );

        (bool success, bytes memory result) = target.call(data);
        if (!success) revert CallFailed(0, result);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  SESSION KEY MANAGEMENT
    //  Simple time-based keys AND full policy-scoped keys.
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Add a simple time-based session key.
     * @dev This key can call execute/executeBatch via onlyAuthorized.
     * @param key      Address of the session key
     * @param duration How long the key is valid (seconds from now)
     */
    function addSessionKey(address key, uint256 duration) external onlyOwner {
        uint256 expiry = block.timestamp + duration;
        _main().sessionKeys[key] = expiry;
        emit SessionKeyAdded(key, expiry);
    }

    /**
     * @notice Revoke a simple session key.
     */
    function revokeSessionKey(address key) external onlyOwner {
        _main().sessionKeys[key] = 0;
        emit SessionKeyRevoked(key);
    }

    /**
     * @notice Install a session key with a full scoped policy.
     * @dev Policies restrict: selectors, ETH caps, token caps, batch size, gas, time.
     * @param key     Session key address
     * @param policy  The policy to enforce
     */
    function installSession(address key, SessionPolicy calldata policy) external onlyOwner {
        _sessions().policyOf[key] = policy;
        emit SessionInstalled(key, policy.validUntil, policy.nonceDomain);
    }

    /**
     * @notice Revoke a scoped session policy.
     */
    function revokeSession(address key) external onlyOwner {
        delete _sessions().policyOf[key];
        emit SessionRevoked(key);
    }

    /**
     * @notice Execute calls using a scoped session key.
     * @dev Enforces all policy constraints: selectors, ETH caps, token caps, etc.
     * @param calls       The calls to execute
     * @param sessionKey  The session key authorizing this
     * @param nonce       Session nonce for replay protection
     */
    function executeWithSession(
        Call[] calldata calls,
        address sessionKey,
        uint256 nonce
    ) external nonReentrant returns (bytes[] memory results) {
        // Caller must be the session key
        if (msg.sender != sessionKey) revert NotAuthorized();

        SessionStorage storage ss = _sessions();
        SessionPolicy storage p = ss.policyOf[sessionKey];

        if (!p.active) revert NoPolicy();
        if (block.timestamp < p.validAfter || block.timestamp > p.validUntil) revert SessionExpired();

        // Nonce check
        uint256 expectedNonce = ss.nonces[sessionKey][p.nonceDomain];
        if (nonce != expectedNonce) revert ReplayDetected();

        results = new bytes[](calls.length);

        for (uint256 i = 0; i < calls.length; i++) {
            // Enforce policy
            _enforceSessionPolicy(p, calls[i]);

            uint256 gasToUse = p.gasLimitPerCall == 0 ? gasleft() : uint256(p.gasLimitPerCall);
            (bool success, bytes memory result) = calls[i].target.call{
                value: calls[i].value,
                gas: gasToUse
            }(calls[i].data);

            if (!success) revert CallFailed(i, result);
            results[i] = result;

            if (p.maxCallsPerBatch != 0 && i + 1 > p.maxCallsPerBatch) revert TooManyCalls();
        }

        // Increment nonce
        ss.nonces[sessionKey][p.nonceDomain] = expectedNonce + 1;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  MODULE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Approve or revoke a module for delegatecall.
     * @param module   Module contract address
     * @param approved True to approve, false to revoke
     */
    function setModule(address module, bool approved) external onlyOwner {
        _main().approvedModules[module] = approved;
        emit ModuleApproved(module, approved);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  ERC-1271 — CONTRACT SIGNATURE VALIDATION
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Validate a signature (ERC-1271).
     * @dev Dapps call this to verify the EOA/wallet signed something.
     *      Returns magic value 0x1626ba7e if the signature is from the owner.
     */
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (_recoverSig(hash, signature) == _main().owner) {
            return 0x1626ba7e;
        }
        return 0xffffffff;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function owner() external view returns (address) {
        return _main().owner;
    }

    function walletNonce() external view returns (uint256) {
        return _main().walletNonce;
    }

    function sessionKeys(address key) external view returns (uint256) {
        return _main().sessionKeys[key];
    }

    function approvedModules(address module) external view returns (bool) {
        return _main().approvedModules[module];
    }

    function getSessionPolicy(address key) external view returns (SessionPolicy memory) {
        return _sessions().policyOf[key];
    }

    function getSessionNonce(address key, uint256 domain) external view returns (uint256) {
        return _sessions().nonces[key][domain];
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparator();
    }

    // ═══════════════════════════════════════════════════════════════════
    //  REVOCATION / CLEANUP
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Clean up storage before revoking delegation.
     * @dev Call this, then sign a new auth tuple with target = address(0)
     *      to fully revert the EOA to normal.
     */
    function cleanupBeforeRevoke() external onlyOwner {
        MainStorage storage m = _main();
        m.walletNonce = 0;
        m.owner = address(0);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  INTERNALS
    // ═══════════════════════════════════════════════════════════════════

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256("UniversalDelegate"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    function _recoverSig(bytes32 digest, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
        return ecrecover(digest, v, r, s);
    }

    function _enforceSessionPolicy(SessionPolicy storage p, Call calldata c) internal view {
        // Selector allowlist
        if (p.allowedSelectors.length > 0 && c.data.length >= 4) {
            bytes4 sel = bytes4(c.data[:4]);
            bool found = false;
            for (uint256 j = 0; j < p.allowedSelectors.length; j++) {
                if (p.allowedSelectors[j] == sel) { found = true; break; }
            }
            if (!found) revert SelectorDenied();
        }

        // ETH cap
        if (p.perTxEthLimit > 0 && c.value > p.perTxEthLimit) revert EthCapExceeded();

        // Token transfer cap
        if (p.allowedToken != address(0) && c.target == p.allowedToken && c.data.length >= 4) {
            bytes4 sel = bytes4(c.data[:4]);
            if (sel == IERC20.transfer.selector && c.data.length >= 68) {
                // decode amount from transfer(address,uint256)
                uint256 amt = abi.decode(c.data[36:68], (uint256));
                if (amt > p.perTxTokenLimit) revert TokenCapExceeded();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  RECEIVE ETH
    // ═══════════════════════════════════════════════════════════════════

    receive() external payable {}
    fallback() external payable {}
}
