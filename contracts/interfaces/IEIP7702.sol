// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title IEIP7702
 * @dev Interface for EIP-7702 Set EOA Account Code
 */
interface IEIP7702 {
    /// @notice Set the EOA account code for delegation
    /// @param nonce The nonce of the authorization
    /// @param target The target contract address to delegate to
    /// @param chainId The chain ID
    /// @param v Signature recovery value
    /// @param r Signature r value
    /// @param s Signature s value
    function setEOAAccountCode(
        uint256 nonce,
        address target,
        uint256 chainId,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
