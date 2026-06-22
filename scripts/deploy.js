const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("🚀 Deploying EIP-7702 Sweeper System...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // Deploy Registry
  console.log("1️⃣ Deploying SweeperRegistry...");
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;
  const Registry = await ethers.getContractFactory("SweeperRegistry");
  const registry = await Registry.deploy(feeRecipient);
  await registry.waitForDeployment();
  console.log(`   Registry deployed to: ${await registry.getAddress()}\n`);

  // Deploy Implementation
  console.log("2️⃣ Deploying SweeperDelegate Implementation...");
  const sweeperBot = process.env.SWEEPER_BOT_ADDRESS || deployer.address;
  const minSweepAmount = ethers.parseEther(process.env.MIN_SWEEP_AMOUNT || "0.01");
  const maxGasPrice = ethers.parseUnits(process.env.MAX_GAS_PRICE || "100", "gwei");
  const sweepCooldown = process.env.SWEEP_COOLDOWN || 3600; // 1 hour
  
  const Delegate = await ethers.getContractFactory("SweeperDelegate");
  const implementation = await Delegate.deploy(
    sweeperBot,
    minSweepAmount,
    maxGasPrice,
    sweepCooldown
  );
  await implementation.waitForDeployment();
  console.log(`   Implementation deployed to: ${await implementation.getAddress()}\n`);

  // Deploy Factory
  console.log("3️⃣ Deploying SweeperFactory...");
  const Factory = await ethers.getContractFactory("SweeperFactory");
  const factory = await Factory.deploy(
    await registry.getAddress(),
    await implementation.getAddress()
  );
  await factory.waitForDeployment();
  console.log(`   Factory deployed to: ${await factory.getAddress()}\n`);

  // Save deployment addresses
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    registry: await registry.getAddress(),
    implementation: await implementation.getAddress(),
    factory: await factory.getAddress(),
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };

  const fs = require("fs");
  const deploymentsDir = "./deployments";
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  
  fs.writeFileSync(
    `${deploymentsDir}/${hre.network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("✅ Deployment complete!");
  console.log("\n📋 Summary:");
  console.log(`   Registry: ${deploymentInfo.registry}`);
  console.log(`   Implementation: ${deploymentInfo.implementation}`);
  console.log(`   Factory: ${deploymentInfo.factory}`);
  console.log(`\n📄 Deployment info saved to deployments/${hre.network.name}.json`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
