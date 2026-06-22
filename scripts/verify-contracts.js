require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  const delegate = process.env.SWEEPER_DELEGATE_ADDRESS;
  const registry = process.env.SWEEPER_REGISTRY_ADDRESS;
  const factory = process.env.SWEEPER_FACTORY_ADDRESS;
  const feeRecipient = process.env.FEE_RECIPIENT;
  const sweeperBot = process.env.SWEEPER_BOT_ADDRESS;
  const minSweepAmount = process.env.MIN_SWEEP_AMOUNT;
  const maxGasPrice = process.env.MAX_GAS_PRICE;
  const sweepCooldown = process.env.SWEEP_COOLDOWN;
  const implementation = process.env.SWEEPER_IMPLEMENTATION_ADDRESS;

  if (!delegate || !registry || !factory || !feeRecipient || !sweeperBot || !minSweepAmount || !maxGasPrice || !sweepCooldown || !implementation) {
    throw new Error("Set delegate, registry, factory, implementation, and constructor env variables before verification");
  }

  await hre.run("verify:verify", {
    address: delegate,
    constructorArguments: [
      sweeperBot,
      hre.ethers.parseEther(minSweepAmount),
      hre.ethers.parseUnits(maxGasPrice, "gwei"),
      Number(sweepCooldown)
    ]
  });

  await hre.run("verify:verify", {
    address: registry,
    constructorArguments: [feeRecipient]
  });

  await hre.run("verify:verify", {
    address: factory,
    constructorArguments: [registry, implementation]
  });

  console.log(`Contracts verified on ${network}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
