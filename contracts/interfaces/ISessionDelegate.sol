// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title ISessionDelegate
 * @notice Interface for the EIP-712 Session Key delegate (EIP-7702 compatible).
 */
interface ISessionDelegate {
    struct SessionKey {
        address key; // the session signer EOA
        address token; // ERC-20 the session key may spend (address(0) = native)
        address target; // contract the session key may call (address(0) = any)
        bytes4 selector; // function selector allowed (0 = any)
        uint256 maxSpend; // max cumulative amount the key may move
        uint256 spent; // cumulative amount already moved by this key
        uint256 expiry; // unix timestamp after which the key is invalid
        uint256 nonce; // replay protection nonce for this key
        bool active;
    }

    event SessionGranted(
        address indexed owner,
        bytes32 indexed sessionHash,
        address sessionKey,
        address token,
        address target,
        bytes4 selector,
        uint256 maxSpend,
        uint256 expiry
    );

    event SessionRevoked(address indexed owner, address indexed sessionKey);
    event SessionExecuted(
        address indexed owner,
        address indexed sessionKey,
        uint256 nonce,
        uint256 amountSpent
    );

    /**
     * @notice EIP-712 hash of a session grant authorization.
     */
    function sessionHash(
        address owner,
        address sessionKey,
        address token,
        address target,
        bytes4 selector,
        uint256 maxSpend,
        uint256 expiry,
        uint256 nonce
    ) external view returns (bytes32);

    /**
     * @notice Grant a session key by presenting the owner's EIP-712 signature.
     */
    function grantSession(
        address sessionKey,
        address token,
        address target,
        bytes4 selector,
        uint256 maxSpend,
        uint256 expiry,
        uint256 nonce,
        bytes calldata signature
    ) external;

    /**
     * @notice Revoke a session key. Only the account owner may call.
     */
    function revokeSession(address sessionKey) external;

    /**
     * @notice Execute a batch of calls under a session key's authority.
     * @dev Intended to be invoked via EIP-7702 delegation from the owner EOA,
     *      so msg.sender == owner. The session key signs the batch off-chain.
     */
    function executeSession(
        address sessionKey,
        address[] calldata targets,
        bytes[] calldata datas,
        uint256[] calldata values,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external payable;
}
