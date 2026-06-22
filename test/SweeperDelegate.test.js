const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SweeperDelegate", function () {
  let SweeperDelegate;
  let sweeperDelegate;
  let owner;
  let sweeperBot;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, sweeperBot, user1, user2] = await ethers.getSigners();
    
    SweeperDelegate = await ethers.getContractFactory("SweeperDelegate");
    sweeperDelegate = await SweeperDelegate.deploy(
      sweeperBot.address,
      ethers.parseEther("0.01"), // minSweepAmount
      ethers.parseUnits("100", "gwei"), // maxGasPrice
      3600 // sweepCooldown
    );
    await sweeperDelegate.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await sweeperDelegate.owner()).to.equal(owner.address);
    });

    it("Should set the sweeper bot address", async function () {
      expect(await sweeperDelegate.sweeperBot()).to.equal(sweeperBot.address);
    });

    it("Should set the min sweep amount", async function () {
      expect(await sweeperDelegate.minSweepAmount()).to.equal(
        ethers.parseEther("0.01")
      );
    });

    it("Should start unpaused", async function () {
      expect(await sweeperDelegate.paused()).to.equal(false);
    });
  });

  describe("Sweeping", function () {
    it("Should allow sweeper bot to execute sweep", async function () {
      // Fund the contract
      await owner.sendTransaction({
        to: await sweeperDelegate.getAddress(),
        value: ethers.parseEther("1.0")
      });

      const sweeperBalanceBefore = await ethers.provider.getBalance(
        sweeperBot.address
      );

      await sweeperDelegate
        .connect(sweeperBot)
        .executeSweep(await sweeperDelegate.getAddress());

      const sweeperBalanceAfter = await ethers.provider.getBalance(
        sweeperBot.address
      );

      expect(sweeperBalanceAfter - sweeperBalanceBefore).to.be.gt(0);
    });

    it("Should not allow non-sweeper bot to execute sweep", async function () {
      await expect(
        sweeperDelegate.connect(user1).executeSweep(user1.address)
      ).to.be.revertedWith("SweeperDelegate: not sweeper bot");
    });

    it("Should respect cooldown period", async function () {
      await owner.sendTransaction({
        to: await sweeperDelegate.getAddress(),
        value: ethers.parseEther("1.0")
      });

      await sweeperDelegate.connect(sweeperBot).executeSweep(
        await sweeperDelegate.getAddress()
      );

      // Try to sweep again immediately
      const canSweep = await sweeperDelegate.getSweepStatus(
        await sweeperDelegate.getAddress()
      );
      expect(canSweep.canSweep).to.equal(false);
    });

    it("Should enforce minimum sweep amount", async function () {
      await owner.sendTransaction({
        to: await sweeperDelegate.getAddress(),
        value: ethers.parseEther("0.001")
      });

      const status = await sweeperDelegate.getSweepStatus(
        await sweeperDelegate.getAddress()
      );
      expect(status.canSweep).to.equal(false);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update sweeper bot", async function () {
      await sweeperDelegate.connect(owner).updateSweeperBot(user2.address);
      expect(await sweeperDelegate.sweeperBot()).to.equal(user2.address);
    });

    it("Should allow owner to pause", async function () {
      await sweeperDelegate.connect(owner).pause();
      expect(await sweeperDelegate.paused()).to.equal(true);
    });

    it("Should not execute sweeps when paused", async function () {
      await sweeperDelegate.connect(owner).pause();

      await expect(
        sweeperDelegate.connect(sweeperBot).executeSweep(
          await sweeperDelegate.getAddress()
        )
      ).to.be.revertedWith("SweeperDelegate: paused");
    });
  });
});
