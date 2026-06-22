require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  const delegate = process.env.SWEEPER_DELEGATE_ADDRESS;
  const registry = process.env.SWEEPER_REGISTRY_ADDRESS;
  const factory = process.env.SWEEPER_FACTORY_ADDRESS;

  if (!delegate || !registry || !factory) {
    throw new Error("Set SWEEPER_DELEGATE_ADDRESS, SWEEPER_REGISTRY_ADDRESS, and SWEEPER_FACTORY_ADDRESS");
  }

  await hre.run("verify:verify", { address: delegate, constructorArguments: [registry] });
  await hre.run("verify:verify", { address: registry, constructorArguments: [] });
  await hre.run("verify:verify", { address: factory, constructorArguments: [delegate] });

  console.log(`Contracts verified on ${network}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
