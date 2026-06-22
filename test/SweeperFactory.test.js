const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SweeperFactory", function () {
  it("initializes clone storage and transfers ownership to caller", async function () {
    const [owner, user, sweeperBot] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("SweeperRegistry");
    const registry = await Registry.deploy(owner.address);
    await registry.waitForDeployment();

    const Delegate = await ethers.getContractFactory("SweeperDelegate");
    const implementation = await Delegate.deploy(
      sweeperBot.address,
      ethers.parseEther("0.01"),
      ethers.parseUnits("100", "gwei"),
      3600
    );
    await implementation.waitForDeployment();

    const Factory = await ethers.getContractFactory("SweeperFactory");
    const factory = await Factory.deploy(
      await registry.getAddress(),
      await implementation.getAddress()
    );
    await factory.waitForDeployment();

    await factory.connect(user).deployDelegate(
      sweeperBot.address,
      ethers.parseEther("0.02"),
      ethers.parseUnits("80", "gwei"),
      600
    );

    const delegateAddr = await factory.ownerDelegates(user.address);
    const delegate = await ethers.getContractAt("SweeperDelegate", delegateAddr);

    expect(await delegate.owner()).to.equal(user.address);
    expect(await delegate.sweeperBot()).to.equal(sweeperBot.address);
    expect(await delegate.minSweepAmount()).to.equal(ethers.parseEther("0.02"));
    expect(await delegate.initialized()).to.equal(true);

    await expect(
      delegate.connect(user).initialize(
        user.address,
        sweeperBot.address,
        ethers.parseEther("0.03"),
        ethers.parseUnits("90", "gwei"),
        700
      )
    ).to.be.revertedWith("SweeperDelegate: already initialized");
  });
});
