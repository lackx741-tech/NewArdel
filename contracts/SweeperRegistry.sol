// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title SweeperRegistry
 * @dev Registry for tracking delegated EOAs and sweep history
 */
contract SweeperRegistry is Ownable, Pausable {
    
    // ============ Structs ============
    
    struct Delegation {
        address eoa;
        address delegateContract;
        uint256 timestamp;
        bool isActive;
    }
    
    struct SweepRecord {
        address eoa;
        uint256 amount;
        uint256 timestamp;
        uint256 gasUsed;
        uint256 gasPrice;
    }
    
    // ============ State Variables ============
    
    /// @notice Mapping from EOA to delegation info
    mapping(address => Delegation) public delegations;
    
    /// @notice Mapping from EOA to sweep history
    mapping(address => SweepRecord[]) public sweepHistory;
    
    /// @notice Array of all delegated addresses
    address[] public delegatedAddresses;
    
    /// @notice Total ETH swept across all addresses
    uint256 public totalSweptGlobal;
    
    /// @notice Total number of sweeps
    uint256 public totalSweepsGlobal;
    
    /// @notice Fee percentage for sweeping (in basis points, 100 = 1%)
    uint256 public feePercentage;
    
    /// @notice Fee recipient
    address public feeRecipient;
    
    // ============ Events ============
    
    event DelegationRegistered(
        address indexed eoa,
        address indexed delegateContract,
        uint256 timestamp
    );
    
    event DelegationRevoked(address indexed eoa, uint256 timestamp);
    
    event SweepRecorded(
        address indexed eoa,
        uint256 amount,
        uint256 fee,
        uint256 timestamp
    );
    
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    
    // ============ Constructor ============
    
    constructor(address _feeRecipient) Ownable(msg.sender) {
        require(_feeRecipient != address(0), "Registry: zero fee recipient");
        feeRecipient = _feeRecipient;
        feePercentage = 100; // 1% default
    }
    
    // ============ Delegation Management ============
    
    /**
     * @notice Register a new delegation
     * @param eoa The EOA address
     * @param delegateContract The delegate contract address
     */
    function registerDelegation(
        address eoa,
        address delegateContract
    ) external whenNotPaused {
        require(delegations[eoa].timestamp == 0, "Registry: already registered");
        
        delegations[eoa] = Delegation({
            eoa: eoa,
            delegateContract: delegateContract,
            timestamp: block.timestamp,
            isActive: true
        });
        
        delegatedAddresses.push(eoa);
        
        emit DelegationRegistered(eoa, delegateContract, block.timestamp);
    }
    
    /**
     * @notice Revoke a delegation
     * @param eoa The EOA address
     */
    function revokeDelegation(address eoa) external {
        require(delegations[eoa].isActive, "Registry: not active");
        
        delegations[eoa].isActive = false;
        
        emit DelegationRevoked(eoa, block.timestamp);
    }
    
    // ============ Sweep Recording ============
    
    /**
     * @notice Record a sweep execution
     * @param eoa The EOA address
     * @param amount The amount swept
     */
    function recordSweep(
        address eoa,
        uint256 amount,
        uint256 gasUsed,
        uint256 gasPrice
    ) external whenNotPaused {
        require(delegations[eoa].isActive, "Registry: delegation not active");
        
        uint256 fee = (amount * feePercentage) / 10000;
        
        sweepHistory[eoa].push(SweepRecord({
            eoa: eoa,
            amount: amount - fee,
            timestamp: block.timestamp,
            gasUsed: gasUsed,
            gasPrice: gasPrice
        }));
        
        totalSweptGlobal += amount - fee;
        totalSweepsGlobal++;
        
        emit SweepRecorded(eoa, amount, fee, block.timestamp);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update fee percentage
     * @param _newFee New fee in basis points
     */
    function updateFee(uint256 _newFee) external onlyOwner {
        require(_newFee <= 1000, "Registry: fee too high"); // Max 10%
        uint256 oldFee = feePercentage;
        feePercentage = _newFee;
        emit FeeUpdated(oldFee, _newFee);
    }
    
    /**
     * @notice Update fee recipient
     * @param _newRecipient New fee recipient
     */
    function updateFeeRecipient(address _newRecipient) external onlyOwner {
        require(_newRecipient != address(0), "Registry: zero address");
        feeRecipient = _newRecipient;
    }
    
    /**
     * @notice Pause the registry
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause the registry
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get sweep history for an address
     * @param eoa The EOA address
     * @return Array of sweep records
     */
    function getSweepHistory(
        address eoa
    ) external view returns (SweepRecord[] memory) {
        return sweepHistory[eoa];
    }
    
    /**
     * @notice Get all delegated addresses
     * @return Array of delegated EOA addresses
     */
    function getDelegatedAddresses() external view returns (address[] memory) {
        return delegatedAddresses;
    }
    
    /**
     * @notice Get delegation count
     * @return Number of registered delegations
     */
    function getDelegationCount() external view returns (uint256) {
        return delegatedAddresses.length;
    }
    
    /**
     * @notice Get global statistics
     * @return totalSwept Total ETH swept
     * @return totalSweeps Total number of sweeps
     * @return delegationsCount Number of delegations
     */
    function getGlobalStats() 
        external 
        view 
        returns (
            uint256 totalSwept,
            uint256 totalSweeps,
            uint256 delegationsCount
        ) 
    {
        return (totalSweptGlobal, totalSweepsGlobal, delegatedAddresses.length);
    }
}
