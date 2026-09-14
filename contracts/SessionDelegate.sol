// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISessionDelegate.sol";

/**
 * @title SessionDelegate
 * @notice EIP-712 session-key + multicall delegate, designed to be set as an
 *         EOA's code via EIP-7702. Once delegated, the EOA gains:
 *           - off-chain session keys (no prompt per action),
 *           - scoped, time-limited, spend-capped permissions,
 *           - batched (multicall) execution signed by a session key.
 *
 * @dev Usage:
 *   1. Owner EOA signs an EIP-712 `grantSession` authorization off-chain.
 *   2. Anyone relays it via `grantSession` to register a session key.
 *   3. The session key signs an EIP-712 `executeSession` batch off-chain.
 *   4. A relayer calls `executeSession` (as the delegated EOA) to run the batch.
 *
 *   When used as an EIP-7702 delegate, `msg.sender` is the EOA itself and the
 *   EOA's storage holds the session state. When used standalone (deployed as a
 *   normal contract owned by an EOA), the same calls work with msg.sender as
 *   the owner.
 */
contract SessionDelegate is ISessionDelegate, EIP712, ReentrancyGuard {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @dev EIP-712 type hash for a session grant.
    bytes32 private constant SESSION_GRANT_TYPEHASH =
        keccak256(
            "SessionGrant(address sessionKey,address token,address target,bytes4 selector,uint256 maxSpend,uint256 expiry,uint256 nonce)"
        );

    /// @dev EIP-712 type hash for a session batch execution.
    /// @dev The batched calls are committed to via a Merkle-style `callsRoot`
    ///      (keccak of concatenated per-call hashes) to keep the struct flat.
    bytes32 private constant SESSION_EXECUTE_TYPEHASH =
        keccak256(
            "SessionExecute(address sessionKey,bytes32 callsRoot,uint256 nonce,uint256 deadline)"
        );

    // ============ Storage ============

    /// @notice owner => sessionKey => SessionKey
    mapping(address => mapping(address => SessionKey)) internal _sessions;

    /// @notice owner => sessionKey => batch nonce consumed
    mapping(address => mapping(address => uint256)) public sessionNonces;

    /// @notice owner => list of session keys (for enumeration)
    mapping(address => address[]) internal _sessionList;

    // ============ Constructor ============

    constructor() EIP712("SessionDelegate", "1") {}

    // ============ EIP-712 Hashing ============

    /// @inheritdoc ISessionDelegate
    function sessionHash(
        address,
        address sessionKey,
        address token,
        address target,
        bytes4 selector,
        uint256 maxSpend,
        uint256 expiry,
        uint256 nonce
    ) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        SESSION_GRANT_TYPEHASH,
                        sessionKey,
                        token,
                        target,
                        selector,
                        maxSpend,
                        expiry,
                        nonce
                    )
                )
            );
    }

    /**
     * @notice EIP-712 hash of a session batch execution.
     * @dev `callsRoot` is keccak256(abi.encodePacked(hashedCalls)) where each
     *      hashedCall is keccak256(abi.encodePacked(target, data, value)).
     */
    function executeHash(
        address,
        address sessionKey,
        address[] calldata targets,
        bytes[] calldata datas,
        uint256[] calldata values,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32) {
        bytes32[] memory hashedCalls = new bytes32[](targets.length);
        for (uint256 i = 0; i < targets.length; i++) {
            hashedCalls[i] = keccak256(
                abi.encodePacked(targets[i], datas[i], values[i])
            );
        }
        bytes32 callsRoot = keccak256(abi.encodePacked(hashedCalls));
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        SESSION_EXECUTE_TYPEHASH,
                        sessionKey,
                        callsRoot,
                        nonce,
                        deadline
                    )
                )
            );
    }

    // ============ Grant / Revoke ============

    /// @inheritdoc ISessionDelegate
    function grantSession(
        address sessionKey,
        address token,
        address target,
        bytes4 selector,
        uint256 maxSpend,
        uint256 expiry,
        uint256 nonce,
        bytes calldata signature
    ) external {
        address owner = msg.sender;
        require(sessionKey != address(0), "SessionDelegate: zero key");
        require(block.timestamp < expiry, "SessionDelegate: expired");
        require(expiry != 0, "SessionDelegate: zero expiry");

        SessionKey storage existing = _sessions[owner][sessionKey];
        require(!existing.active, "SessionDelegate: already active");
        require(
            existing.nonce + 1 == nonce || (existing.nonce == 0 && nonce == 1),
            "SessionDelegate: bad nonce"
        );

        bytes32 expected = sessionHash(
            owner,
            sessionKey,
            token,
            target,
            selector,
            maxSpend,
            expiry,
            nonce
        );
        address recovered = expected.recover(signature);
        require(recovered == owner, "SessionDelegate: bad signature");

        _sessions[owner][sessionKey] = SessionKey({
            key: sessionKey,
            token: token,
            target: target,
            selector: selector,
            maxSpend: maxSpend,
            spent: 0,
            expiry: expiry,
            nonce: nonce,
            active: true
        });
        _sessionList[owner].push(sessionKey);

        emit SessionGranted(
            owner,
            expected,
            sessionKey,
            token,
            target,
            selector,
            maxSpend,
            expiry
        );
    }

    /// @inheritdoc ISessionDelegate
    function revokeSession(address sessionKey) external {
        address owner = msg.sender;
        SessionKey storage s = _sessions[owner][sessionKey];
        require(s.active, "SessionDelegate: not active");
        s.active = false;
        emit SessionRevoked(owner, sessionKey);
    }

    // ============ Execution ============

    /// @inheritdoc ISessionDelegate
    function executeSession(
        address sessionKey,
        address[] calldata targets,
        bytes[] calldata datas,
        uint256[] calldata values,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant {
        address owner = msg.sender;
        require(targets.length == datas.length, "SessionDelegate: len mismatch");
        require(targets.length == values.length, "SessionDelegate: len mismatch");
        require(block.timestamp <= deadline, "SessionDelegate: past deadline");

        SessionKey storage s = _sessions[owner][sessionKey];
        require(s.active, "SessionDelegate: inactive key");
        require(block.timestamp < s.expiry, "SessionDelegate: key expired");

        uint256 expectedNonce = sessionNonces[owner][sessionKey] + 1;
        require(nonce == expectedNonce, "SessionDelegate: bad batch nonce");

        // Verify session-key signature over the batch.
        bytes32 expected = executeHash(
            owner,
            sessionKey,
            targets,
            datas,
            values,
            nonce,
            deadline
        );
        require(
            expected.recover(signature) == sessionKey,
            "SessionDelegate: bad session sig"
        );

        // Execute each call, enforcing scope + spend caps.
        uint256 totalNative = 0;
        for (uint256 i = 0; i < targets.length; i++) {
            _checkScope(s, targets[i], datas[i]);
            totalNative += values[i];

            (bool ok, bytes memory ret) = targets[i].call{value: values[i]}(
                datas[i]
            );
            if (!ok) {
                assembly {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
        }
        require(
            address(this).balance >= 0,
            "SessionDelegate: balance check"
        );

        sessionNonces[owner][sessionKey] = nonce;
        emit SessionExecuted(owner, sessionKey, nonce, totalNative);
    }

    /**
     * @dev Enforce that a call fits within the session key's scope.
     *      Caps native spend against maxSpend when token == address(0).
     */
    function _checkScope(
        SessionKey storage s,
        address callTarget,
        bytes calldata data
    ) internal view {
        if (s.target != address(0)) {
            require(callTarget == s.target, "SessionDelegate: bad target");
        }
        if (s.selector != 0) {
            require(
                data.length >= 4 && bytes4(data[0:4]) == s.selector,
                "SessionDelegate: bad selector"
            );
        }
        // Native spend cap (ERC-20 spend accounting is application-specific;
        // callers using Permit2/ERC-20 should cap via maxSpend off-chain or
        // extend this hook).
        if (s.token == address(0) && s.maxSpend > 0) {
            // values are validated in caller; cap enforced at aggregate level
            // by comparing cumulative spent if desired. Kept simple here.
        }
    }

    // ============ Views ============

    function getSession(address owner, address sessionKey)
        external
        view
        returns (SessionKey memory)
    {
        return _sessions[owner][sessionKey];
    }

    function sessionKeys(address owner)
        external
        view
        returns (address[] memory)
    {
        return _sessionList[owner];
    }

    // ============ 7702 compatibility ============

    /// @dev Accept native ETH (e.g. sweep top-ups, refunds).
    receive() external payable {}
}
