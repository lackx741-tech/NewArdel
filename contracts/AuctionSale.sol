// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract AuctionSale {
    address public highestBidder;
    uint256 public highestBid;
    uint256 public auctionEndTime;
    bool public ended;
    event NewBid(address bidder, uint256 amount);
    function bid() external payable {
        require(block.timestamp < auctionEndTime, "ended");
        require(msg.value > highestBid, "too low");
        highestBid = msg.value;
        highestBidder = msg.sender;
        emit NewBid(msg.sender, msg.value);
    }
    function setEndTime(uint256 t) external { auctionEndTime = t; }
}
