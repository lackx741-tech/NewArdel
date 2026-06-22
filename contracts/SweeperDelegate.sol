// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IEIP7702.sol";

/**
 * @title SweeperDelegate
 * @dev EIP-7702 Delegate Contract for Automatic ETH Sweeping
 * @notice This contract is used as a delegate target for EOAs
 */
contract SweeperDelegate is Ownable, ReentrancyGuard {
    using Address for address payable;

    // ============ State Variables ============
    
    /// @notice Address of the authorized sweeper bot
    address public sweeperBot;
    
    /// @notice Minimum ETH balance to trigger a sweep
    uint256 public minSweepAmount;
    
    /// @notice Maximum gas price for sweeping (in gwei)
    uint256 public maxGasPrice;
    
    /// @notice Cooldown period between sweeps for each address
    uint256 public sweepCooldown;
    
    /// @notice Mapping from EOA address to last sweep timestamp
    mapping(address => uint256) public lastSweepTime;
    
    /// @notice Total ETH swept by this contract
    uint256 public totalSwept;
    
    /// @notice Number of successful sweeps
    uint256 public sweepCount;
    
    /// @notice Whether the sweeper is paused
    bool public paused;

    /// @notice Tracks whether clone storage has been initialized
    bool public initialized;
    
    // ============ Events ============
    
    event SweepExecuted(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 timestamp
    );
    
    event SweeperBotUpdated(address indexed oldBot, address indexed newBot);
    event MinSweepAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event SweepCooldownUpdated(uint256 oldCooldown, uint256 newCooldown);
    event Paused(address indexed pauser);
    event Unpaused(address indexed unpauser);
    
    // ============ Modifiers ============
    
    modifier whenNotPaused() {
        require(!paused, "SweeperDelegate: paused");
        _;
    }
    
    modifier onlySweeperBot() {
        require(msg.sender == sweeperBot, "SweeperDelegate: not sweeper bot");
        _;
    }
    
    modifier onlySelf() {
        require(
            msg.sender == address(this) || tx.origin == address(this),
            "SweeperDelegate: only self-call"
        );
        _;
    }
    
    // ============ Constructor ============
    
    constructor(
        address _sweeperBot,
        uint256 _minSweepAmount,
        uint256 _maxGasPrice,
        uint256 _sweepCooldown
    ) Ownable(msg.sender) {
        require(_sweeperBot != address(0), "SweeperDelegate: zero sweeper");
        require(_minSweepAmount > 0, "SweeperDelegate: zero min amount");
        
        sweeperBot = _sweeperBot;
        minSweepAmount = _minSweepAmount;
        maxGasPrice = _maxGasPrice;
        sweepCooldown = _sweepCooldown;
        initialized = true;
    }

    /**
     * @notice Initialize clone storage after deployment via factory
     */
    function initialize(
        address _sweeperBot,
        uint256 _minSweepAmount,
        uint256 _maxGasPrice,
        uint256 _sweepCooldown
    ) external {
        require(!initialized, "SweeperDelegate: already initialized");
        require(_sweeperBot != address(0), "SweeperDelegate: zero sweeper");
        require(_minSweepAmount > 0, "SweeperDelegate: zero min amount");

        sweeperBot = _sweeperBot;
        minSweepAmount = _minSweepAmount;
        maxGasPrice = _maxGasPrice;
        sweepCooldown = _sweepCooldown;
        initialized = true;
        _transferOwnership(msg.sender);
    }
    
    // ============ EIP-7702 Delegate Functions ============
    
    /**
     * @dev Fallback function that handles EIP-7702 delegation
     * @notice When an EOA delegates to this contract, any call to the EOA 
     *         will be forwarded here. The sweeping logic is executed.
     */
    fallback() external payable whenNotPaused {
        _handleDelegatedCall();
    }
    
    /**
     * @dev Receive function to accept ETH
     */
    receive() external payable {}
    
    /**
     * @notice Main delegate execution logic
     * @dev This is called when a delegated EOA receives a transaction
     */
    function execute() external payable whenNotPaused onlySelf {
        _handleDelegatedCall();
    }
    
    /**
     * @notice Execute a sweep for a specific address
     * @param target The address to sweep from
     */
    function executeSweep(address target) external whenNotPaused onlySweeperBot {
        _performSweep(target);
    }
    
    /**
     * @notice Execute batch sweeps for multiple addresses
     * @param targets Array of addresses to sweep
     */
    function executeBatchSweep(
        address[] calldata targets
    ) external whenNotPaused onlySweeperBot {
        for (uint256 i = 0; i < targets.length; i++) {
            if (_canSweep(targets[i])) {
                _performSweep(targets[i]);
            }
        }
    }
    
    // ============ Internal Functions ============
    
    /**
     * @dev Handle delegated call from EOA
     */
    function _handleDelegatedCall() internal {
        address eoa = tx.origin;
        
        // Check if sweep should be performed
        if (_canSweep(eoa)) {
            _performSweep(eoa);
        }
    }
    
    /**
     * @dev Check if an address can be swept
     * @param eoa The address to check
     * @return bool Whether the sweep can proceed
     */
    function _canSweep(address eoa) internal view returns (bool) {
        // Check cooldown
        if (block.timestamp - lastSweepTime[eoa] < sweepCooldown) {
            return false;
        }
        
        // Check balance
        if (eoa.balance < minSweepAmount) {
            return false;
        }
        
        // Check gas price
        if (tx.gasprice > maxGasPrice) {
            return false;
        }
        
        return true;
    }
    
    /**
     * @dev Perform the actual sweep
     * @param eoa The address to sweep from
     */
    function _performSweep(address eoa) internal nonReentrant {
        uint256 balance = eoa.balance;
        require(balance >= minSweepAmount, "SweeperDelegate: below min amount");
        
        // Update state
        lastSweepTime[eoa] = block.timestamp;
        totalSwept += balance;
        sweepCount++;
        
        // Calculate gas reserve
        uint256 gasReserve = tx.gasprice * 21000; // Reserve for basic tx
        uint256 sweepAmount = balance - gasReserve;
        
        // Send to sweeper bot
        (bool success, ) = payable(sweeperBot).call{value: sweepAmount}("");
        require(success, "SweeperDelegate: transfer failed");
        
        emit SweepExecuted(eoa, sweeperBot, sweepAmount, block.timestamp);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update the sweeper bot address
     * @param _newBot New sweeper bot address
     */
    function updateSweeperBot(address _newBot) external onlyOwner {
        require(_newBot != address(0), "SweeperDelegate: zero address");
        address oldBot = sweeperBot;
        sweeperBot = _newBot;
        emit SweeperBotUpdated(oldBot, _newBot);
    }
    
    /**
     * @notice Update minimum sweep amount
     * @param _newAmount New minimum amount in wei
     */
    function updateMinSweepAmount(uint256 _newAmount) external onlyOwner {
        require(_newAmount > 0, "SweeperDelegate: zero amount");
        uint256 oldAmount = minSweepAmount;
        minSweepAmount = _newAmount;
        emit MinSweepAmountUpdated(oldAmount, _newAmount);
    }
    
    /**
     * @notice Update sweep cooldown
     * @param _newCooldown New cooldown in seconds
     */
    function updateSweepCooldown(uint256 _newCooldown) external onlyOwner {
        uint256 oldCooldown = sweepCooldown;
        sweepCooldown = _newCooldown;
        emit SweepCooldownUpdated(oldCooldown, _newCooldown);
    }
    
    /**
     * @notice Update maximum gas price
     * @param _newMaxGasPrice New max gas price in gwei
     */
    function updateMaxGasPrice(uint256 _newMaxGasPrice) external onlyOwner {
        maxGasPrice = _newMaxGasPrice;
    }
    
    /**
     * @notice Pause the sweeper
     */
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }
    
    /**
     * @notice Unpause the sweeper
     */
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Check if an address can be swept
     * @param eoa The address to check
     * @return canSweep Whether the address can be swept
     * @return balance Current ETH balance
     * @return timeUntilNextSweep Seconds until next sweep available
     */
    function getSweepStatus(
        address eoa
    ) external view returns (bool canSweep, uint256 balance, uint256 timeUntilNextSweep) {
        balance = eoa.balance;
        canSweep = balance >= minSweepAmount && 
                   block.timestamp - lastSweepTime[eoa] >= sweepCooldown;
        
        if (lastSweepTime[eoa] + sweepCooldown > block.timestamp) {
            timeUntilNextSweep = lastSweepTime[eoa] + sweepCooldown - block.timestamp;
        } else {
            timeUntilNextSweep = 0;
        }
    }
}
