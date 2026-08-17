const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

/**
 * Verifies that the client-side EIP-712 signing for UniversalDelegate
 * matches the on-chain ecrecover. This is the load-bearing correctness
 * test: if the digest the widget produces differs from what the contract
 * reconstructs, executeWithSignature reverts with InvalidSignature.
 *
 * Contract EIP-712 spec (from verified source at
 * 0x719754b3e10BD1eD31533D5363afC51ceFE24823):
 *   domain  : EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
 *             name="UniversalDelegate", version="1"
 *   Execute : Execute(address target,uint256 value,bytes data,uint256 nonce,uint256 deadline)
 *             — data is hashed as keccak256(data) inside the structHash
 *   BatchExecute : BatchExecute(bytes32 callsHash,uint256 nonce,uint256 deadline)
 *             — callsHash = keccak256(abi.encode(targets, values, calldatas))
 */
describe("UniversalDelegate EIP-712 intent", function () {
  let owner, delegate, target;
  let ud;

  beforeEach(async function () {
    [owner, target] = await ethers.getSigners();
    const F = await ethers.getContractFactory("UniversalDelegate");
    ud = await F.deploy();
    await ud.waitForDeployment();
    delegate = await ud.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    // initialize ownership via initWithSig (sets m.owner = owner EOA).
    // Note: plain initialize() sets owner = address(this), which is correct
    // under EIP-7702 (address(this) == the EOA) but NOT for a standalone
    // test deployment, so we use the signature-based init path.
    const initDomain = {
      name: "UniversalDelegate",
      version: "1",
      chainId,
      verifyingContract: delegate
    };
    const initTypes = { Init: [{ name: "owner", type: "address" }] };
    const initSig = await owner.signTypedData(initDomain, initTypes, { owner: await owner.getAddress() });
    await ud.initWithSig(await owner.getAddress(), initSig);
  });

  // Replicate the contract's _domainSeparator()
  function domainSep(verifyingContract, chainId) {
    const DOMAIN_TYPEHASH = ethers.id(
      "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32", "bytes32", "uint256", "address"],
        [DOMAIN_TYPEHASH, ethers.id("UniversalDelegate"), ethers.id("1"), chainId, verifyingContract]
      )
    );
  }

  it("signs Execute intent that the contract recovers as the owner", async function () {
    const chainId = (await ethers.provider.getNetwork()).chainId;

    // The call the widget wants the delegate to perform.
    const targetAddr = await target.getAddress();
    const value = 0n;
    const data = ud.interface.encodeFunctionData("owner"); // arbitrary calldata
    const nonce = 0n; // walletNonce starts at 0
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const domain = {
      name: "UniversalDelegate",
      version: "1",
      chainId,
      verifyingContract: delegate
    };
    const types = {
      Execute: [
        { name: "target", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };
    const message = { target: targetAddr, value, data, nonce, deadline };

    // signTypedData produces an EIP-712 signature over the digest that
    // matches the contract's \x19\x01 || domainSeparator || structHash.
    const sig = await owner.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(sig);

    // Sanity: the digest the contract reconstructs must recover to owner.
    const EXECUTE_TYPEHASH = ethers.id("Execute(address target,uint256 value,bytes data,uint256 nonce,uint256 deadline)");
    const structHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address", "uint256", "bytes32", "uint256", "uint256"],
        [EXECUTE_TYPEHASH, targetAddr, value, ethers.keccak256(data), nonce, deadline]
      )
    );
    const digest = ethers.keccak256(
      ethers.concat(["0x1901", domainSep(delegate, chainId), structHash])
    );
    const recovered = ethers.recoverAddress(digest, sig);
    expect(recovered).to.equal(await owner.getAddress());

    // End-to-end: relayer submits executeWithSignature with the split sig.
    const tx = await ud.executeWithSignature(targetAddr, value, data, deadline, v, r, s);
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);
    // walletNonce must increment after execution.
    expect(await ud.walletNonce()).to.equal(1);
  });

  it("signs BatchExecute intent with the exact callsHash formula", async function () {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const targetAddr = await target.getAddress();

    const targets = [targetAddr, targetAddr];
    const values = [0n, 0n];
    const calldatas = [
      ud.interface.encodeFunctionData("owner"),
      ud.interface.encodeFunctionData("DOMAIN_SEPARATOR")
    ];
    const nonce = 0n; // fresh contract per test, walletNonce starts at 0
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // callsHash = keccak256(abi.encode(targets, values, calldatas))
    const callsHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]", "bytes[]"],
        [targets, values, calldatas]
      )
    );

    const domain = {
      name: "UniversalDelegate",
      version: "1",
      chainId,
      verifyingContract: delegate
    };
    const types = {
      BatchExecute: [
        { name: "callsHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };
    const message = { callsHash, nonce, deadline };
    const sig = await owner.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(sig);

    const tx = await ud.executeBatchWithSignature(targets, values, calldatas, deadline, v, r, s);
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);
    expect(await ud.walletNonce()).to.equal(1);
  });

  it("verifyIntent (server-side) matches the on-chain owner for Execute", async function () {
    const { signIntent, verifyIntent } = await import("../widget-modules/intents.js");
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const targetAddr = await target.getAddress();
    const data = ud.interface.encodeFunctionData("owner");
    const onChainOwner = await ud.owner();

    // Sign via the shared runtime helper (same path the widget uses).
    const intent = await signIntent(
      { delegateAddress: delegate, target: targetAddr, value: 0n, data, deadlineSeconds: 3600 },
      ethers.provider
    );
    expect(BigInt(intent.nonce)).to.equal(0n);

    // Server-side verification must recover to the on-chain owner.
    const recovered = verifyIntent(intent, chainId, onChainOwner);
    expect(recovered).to.equal(onChainOwner);

    // And the assembled relay calldata must execute successfully.
    const { buildRelayCalldata } = await import("../widget-modules/intents.js");
    const calldata = buildRelayCalldata(intent);
    const tx = await (await ethers.getSigners())[0].sendTransaction({ to: delegate, data: calldata });
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);
  });

  it("verifyIntent (server-side) matches for BatchExecute", async function () {
    const { signBatchIntent, verifyIntent, buildRelayCalldata } = await import("../widget-modules/intents.js");
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const onChainOwner = await ud.owner();
    const targetAddr = await target.getAddress();

    const calls = [
      { to: targetAddr, data: ud.interface.encodeFunctionData("owner") },
      { to: targetAddr, data: ud.interface.encodeFunctionData("DOMAIN_SEPARATOR") }
    ];
    const intent = await signBatchIntent({ delegateAddress: delegate, calls, deadlineSeconds: 3600 }, ethers.provider);
    const recovered = verifyIntent(intent, chainId, onChainOwner);
    expect(recovered).to.equal(onChainOwner);

    const calldata = buildRelayCalldata(intent);
    const tx = await (await ethers.getSigners())[0].sendTransaction({ to: delegate, data: calldata });
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);
  });
});
