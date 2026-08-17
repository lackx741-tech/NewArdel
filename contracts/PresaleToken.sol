// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PresaleToken
 * @notice Sample client contract added to demonstrate that the widget composer
 *         auto-discovers any new contract dropped into contracts/. After
 *         `npx hardhat compile && node widget-modules/generate-abis.js`, its full
 *         ABI is available in the dashboard and widget runtime with no code
 *         changes elsewhere.
 */
contract PresaleToken is ERC20, Ownable {
    /// @notice Price in wei per whole token (1e18 decimals).
    uint256 public presalePrice;
    /// @notice Wallet that receives presale funds.
    address public presaleWallet;
    /// @notice Cap on total mintable supply during presale.
    uint256 public presaleCap;
    /// @notice Total wei raised so far.
    uint256 public totalRaised;

    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);
    event PresalePriceUpdated(uint256 oldPrice, uint256 newPrice);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 presaleCap_,
        uint256 presalePrice_,
        address presaleWallet_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        require(presaleWallet_ != address(0), "PresaleToken: zero wallet");
        require(presaleCap_ > 0, "PresaleToken: zero cap");
        presaleCap = presaleCap_;
        presalePrice = presalePrice_;
        presaleWallet = presaleWallet_;
    }

    /**
     * @notice Buy tokens with native ETH. Cost = msg.value; tokens minted = msg.value / presalePrice.
     */
    function buy() external payable {
        require(msg.value > 0, "PresaleToken: zero value");
        uint256 tokens = (msg.value * 1e18) / presalePrice;
        require(totalSupply() + tokens <= presaleCap, "PresaleToken: cap exceeded");

        (bool ok, ) = payable(presaleWallet).call{value: msg.value}("");
        require(ok, "PresaleToken: transfer failed");

        _mint(msg.sender, tokens);
        totalRaised += msg.value;
        emit TokensPurchased(msg.sender, tokens, msg.value);
    }

    function updatePresalePrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "PresaleToken: zero price");
        uint256 old = presalePrice;
        presalePrice = newPrice;
        emit PresalePriceUpdated(old, newPrice);
    }
}
