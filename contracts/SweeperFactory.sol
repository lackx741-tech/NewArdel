// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./SweeperDelegate.sol";
import "./SweeperRegistry.sol";

/**
 * @title SweeperFactory
 * @dev Factory for deploying SweeperDelegate contracts
 */
contract SweeperFactory is Ownable {
    using Clones for address;
    
    // ============ State Variables ============
    
    /// @notice Implementation contract for cloning
    address public implementation;
    
    /// @notice Registry contract
    SweeperRegistry public registry;
    
    /// @notice Mapping from owner address to their delegate contract
    mapping(address => address) public ownerDelegates;
    
    /// @notice Array of all deployed delegate contracts
    address[] public allDelegates;
    
    // ============ Events ============
    
    event DelegateDeployed(
        address indexed owner,
        address indexed delegate,
        uint256 timestamp
    );
    
    event ImplementationUpdated(address oldImpl, address newImpl);
    
    // ============ Constructor ============
    
    constructor(
        address _registry,
        address _implementation
    ) Ownable(msg.sender) {
        registry = SweeperRegistry(_registry);
        implementation = _implementation;
    }
    
    // ============ Deploy Functions ============
    
    /**
     * @notice Deploy a new SweeperDelegate contract
     * @param sweeperBot The authorized sweeper bot address
     * @param minSweepAmount Minimum amount to trigger sweep
     * @param maxGasPrice Maximum gas price for sweeping
     * @param sweepCooldown Cooldown period between sweeps
     * @return delegate Address of deployed contract
     */
    function deployDelegate(
        address sweeperBot,
        uint256 minSweepAmount,
        uint256 maxGasPrice,
        uint256 sweepCooldown
    ) external returns (address delegate) {
        require(
            ownerDelegates[msg.sender] == address(0),
            "Factory: already deployed"
        );
        
        // Clone implementation
        delegate = implementation.clone();
        
        // Initialize the clone
        SweeperDelegate(delegate).initialize(
            msg.sender,
            sweeperBot,
            minSweepAmount,
            maxGasPrice,
            sweepCooldown
        );
        
        // Store mapping
        ownerDelegates[msg.sender] = delegate;
        allDelegates.push(delegate);
        
        emit DelegateDeployed(msg.sender, delegate, block.timestamp);
        
        return delegate;
    }
    
    /**
     * @notice Update implementation address
     * @param _newImpl New implementation address
     */
    function updateImplementation(address _newImpl) external onlyOwner {
        require(_newImpl != address(0), "Factory: zero address");
        address oldImpl = implementation;
        implementation = _newImpl;
        emit ImplementationUpdated(oldImpl, _newImpl);
    }
    
    /**
     * @notice Get all deployed delegates
     * @return Array of delegate addresses
     */
    function getAllDelegates() external view returns (address[] memory) {
        return allDelegates;
    }
    
    /**
     * @notice Get delegate count
     * @return Number of deployed delegates
     */
    function getDelegateCount() external view returns (uint256) {
        return allDelegates.length;
    }
}
