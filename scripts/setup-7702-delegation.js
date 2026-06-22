const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("🔐 Setting up EIP-7702 Delegation...\n");

  const [signer] = await ethers.getSigners();
  const eoaAddress = process.env.EOA_ADDRESS || signer.address;
  
  // Load deployment info
  const deployment = require(`../deployments/${hre.network.name}.json`);
  console.log(`Network: ${hre.network.name} (Chain ID: ${hre.network.config.chainId})`);
  console.log(`EOA: ${eoaAddress}`);
  console.log(`Delegate: ${deployment.implementation}\n`);

  // Create EIP-7702 authorization
  const createAuthorization = async () => {
    const chainId = hre.network.config.chainId;
    const nonce = await ethers.provider.getTransactionCount(eoaAddress);
    
    // EIP-7702 authorization message
    const MAGIC = "0x04";
    const messageHash = ethers.solidityPackedKeccak256(
      ["bytes1", "uint256", "address", "uint256"],
      [MAGIC, chainId, deployment.implementation, nonce]
    );
    
    // Sign the authorization
    const signature = await signer.signMessage(ethers.getBytes(messageHash));
    const { r, s, v } = ethers.Signature.from(signature);
    
    return {
      chainId,
      nonce,
      contractAddress: deployment.implementation,
      v,
      r,
      s
    };
  };

  // Create authorization
  const auth = await createAuthorization();
  console.log("✅ Authorization created");
  console.log(`   Nonce: ${auth.nonce}`);
  console.log(`   Signature: ${auth.r.substring(0, 20)}...\n`);

  // Encode the transaction data
  const abiCoder = new ethers.AbiCoder();
  const encodedAuth = abiCoder.encode(
    ["uint8", "uint64", "address", "uint8", "bytes32", "bytes32"],
    [4, auth.nonce, auth.contractAddress, auth.v, auth.r, auth.s]
  );

  // Send delegation transaction
  console.log("📤 Sending EIP-7702 delegation transaction...");
  
  const tx = {
    to: eoaAddress, // Self-call
    from: eoaAddress,
    data: encodedAuth,
    value: 0,
    gasLimit: 100000
  };

  const txResponse = await signer.sendTransaction(tx);
  console.log(`   Transaction sent: ${txResponse.hash}`);

  const receipt = await txResponse.wait();
  console.log(`   Confirmed in block: ${receipt.blockNumber}\n`);

  // Register delegation in registry
  console.log("📝 Registering delegation in SweeperRegistry...");
  const registry = await ethers.getContractAt(
    "SweeperRegistry",
    deployment.registry,
    signer
  );
  
  const registerTx = await registry.registerDelegation(
    eoaAddress,
    deployment.implementation
  );
  await registerTx.wait();
  console.log(`   Registration confirmed: ${registerTx.hash}\n`);

  // Verify delegation
  const delegation = await registry.delegations(eoaAddress);
  console.log("✅ Delegation Setup Complete!");
  console.log(`   Status: ${delegation.isActive ? "Active" : "Inactive"}`);
  console.log(`   Delegated to: ${delegation.delegateContract}`);

  // Save delegation info
  const delegationInfo = {
    eoa: eoaAddress,
    delegate: deployment.implementation,
    chainId: hre.network.config.chainId,
    nonce: auth.nonce,
    txHash: txResponse.hash,
    blockNumber: receipt.blockNumber,
    timestamp: new Date().toISOString()
  };

  const fs = require("fs");
  fs.writeFileSync(
    `./deployments/delegation-${eoaAddress.substring(0, 10)}.json`,
    JSON.stringify(delegationInfo, null, 2)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
