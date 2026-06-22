const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SweeperRegistry", function () {
  it("sets deployer as owner", async function () {
    const [owner] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("SweeperRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    expect(await registry.owner()).to.equal(owner.address);
  });
});
