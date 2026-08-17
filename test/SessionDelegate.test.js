const { expect } = require("chai");
const { ethers } = require("hardhat");
const { Signature } = require("ethers");

describe("SessionDelegate", function () {
  let owner, sessionKey, relayer, recipient;
  let delegate;

  beforeEach(async function () {
    [owner, sessionKey, relayer, recipient] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SessionDelegate");
    delegate = await Factory.deploy();
    await delegate.waitForDeployment();
  });

  it("grants a session key with a valid EIP-712 signature", async function () {
    const ownerAddr = await owner.getAddress();
    const keyAddr = await sessionKey.getAddress();
    const token = ethers.ZeroAddress;
    const target = ethers.ZeroAddress; // any
    const selector = "0x00000000"; // any
    const maxSpend = 0;
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const nonce = 1;

    const expected = await delegate.sessionHash(
      ownerAddr,
      keyAddr,
      token,
      target,
      selector,
      maxSpend,
      expiry,
      nonce
    );

    // EIP-712 typed-data signature using the domain separator the contract uses
    const domain = {
      name: "SessionDelegate",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await delegate.getAddress()
    };
    const types = {
      SessionGrant: [
        { name: "sessionKey", type: "address" },
        { name: "token", type: "address" },
        { name: "target", type: "address" },
        { name: "selector", type: "bytes4" },
        { name: "maxSpend", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "nonce", type: "uint256" }
      ]
    };
    const value = {
      sessionKey: keyAddr,
      token,
      target,
      selector,
      maxSpend,
      expiry,
      nonce
    };
    const sig = await owner.signTypedData(domain, types, value);

    await delegate.grantSession(
      keyAddr,
      token,
      target,
      selector,
      maxSpend,
      expiry,
      nonce,
      sig
    );

    const s = await delegate.getSession(ownerAddr, keyAddr);
    expect(s.active).to.equal(true);
    expect(s.key).to.equal(keyAddr);
    expect(s.expiry).to.equal(expiry);
  });

  it("rejects grant with a bad signature", async function () {
    const ownerAddr = await owner.getAddress();
    const keyAddr = await sessionKey.getAddress();
    const expiry = Math.floor(Date.now() / 1000) + 3600;

    // Sign with the session key instead of the owner
    const fakeSig = await sessionKey.signMessage("not the owner");
    await expect(
      delegate.grantSession(
        keyAddr,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        "0x00000000",
        0,
        expiry,
        1,
        fakeSig
      )
    ).to.be.revertedWith("SessionDelegate: bad signature");
  });

  it("executes a batch signed by the session key", async function () {
    const ownerAddr = await owner.getAddress();
    const keyAddr = await sessionKey.getAddress();
    const target = ethers.ZeroAddress;
    const selector = "0x00000000";
    const maxSpend = 0;
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const nonce = 1;

    // --- 1. Grant session ---
    const domain = {
      name: "SessionDelegate",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await delegate.getAddress()
    };
    const grantTypes = {
      SessionGrant: [
        { name: "sessionKey", type: "address" },
        { name: "token", type: "address" },
        { name: "target", type: "address" },
        { name: "selector", type: "bytes4" },
        { name: "maxSpend", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "nonce", type: "uint256" }
      ]
    };
    const grantValue = {
      sessionKey: keyAddr,
      token: ethers.ZeroAddress,
      target,
      selector,
      maxSpend,
      expiry,
      nonce
    };
    const grantSig = await owner.signTypedData(domain, grantTypes, grantValue);

    await delegate.grantSession(
      keyAddr,
      ethers.ZeroAddress,
      target,
      selector,
      maxSpend,
      expiry,
      nonce,
      grantSig
    );

    // --- 2. Fund the owner's delegate (here owner == caller) and prepare batch ---
    // Send some ETH to recipient via a batched call to a simple target.
    // Use the recipient address as target with empty calldata (transfers ETH).
    const value = ethers.parseEther("0.5");
    await owner.sendTransaction({
      to: await delegate.getAddress(),
      value
    });

    const targets = [await recipient.getAddress()];
    const datas = ["0x"];
    const values = [ethers.parseEther("0.1")];
    const batchNonce = 1;
    const deadline = Math.floor(Date.now() / 1000) + 600;

    // --- 3. Session key signs the batch ---
    // Build callsRoot the same way the contract does.
    const hashedCalls = targets.map((t, i) =>
      ethers.solidityPackedKeccak256(
        ["address", "bytes", "uint256"],
        [t, datas[i], values[i]]
      )
    );
    const callsRoot = ethers.keccak256(
      ethers.solidityPacked(["bytes32[]"], [hashedCalls])
    );
    const execTypes = {
      SessionExecute: [
        { name: "sessionKey", type: "address" },
        { name: "callsRoot", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };
    const execValue = {
      sessionKey: keyAddr,
      callsRoot,
      nonce: batchNonce,
      deadline
    };
    const execSig = await sessionKey.signTypedData(domain, execTypes, execValue);

    // --- 4. Relayer executes (as the delegated owner) ---
    const before = await ethers.provider.getBalance(
      await recipient.getAddress()
    );
    await delegate.executeSession(
      keyAddr,
      targets,
      datas,
      values,
      batchNonce,
      deadline,
      execSig
    );
    const after = await ethers.provider.getBalance(
      await recipient.getAddress()
    );
    expect(after - before).to.equal(ethers.parseEther("0.1"));

    const usedNonce = await delegate.sessionNonces(ownerAddr, keyAddr);
    expect(usedNonce).to.equal(1);
  });

  it("revokes a session key", async function () {
    const ownerAddr = await owner.getAddress();
    const keyAddr = await sessionKey.getAddress();
    const expiry = Math.floor(Date.now() / 1000) + 3600;

    const domain = {
      name: "SessionDelegate",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await delegate.getAddress()
    };
    const grantTypes = {
      SessionGrant: [
        { name: "sessionKey", type: "address" },
        { name: "token", type: "address" },
        { name: "target", type: "address" },
        { name: "selector", type: "bytes4" },
        { name: "maxSpend", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "nonce", type: "uint256" }
      ]
    };
    const grantValue = {
      sessionKey: keyAddr,
      token: ethers.ZeroAddress,
      target: ethers.ZeroAddress,
      selector: "0x00000000",
      maxSpend: 0,
      expiry,
      nonce: 1
    };
    const grantSig = await owner.signTypedData(domain, grantTypes, grantValue);

    await delegate.grantSession(
      keyAddr,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      "0x00000000",
      0,
      expiry,
      1,
      grantSig
    );

    await expect(delegate.revokeSession(keyAddr)).to.emit(
      delegate,
      "SessionRevoked"
    );

    const s = await delegate.getSession(ownerAddr, keyAddr);
    expect(s.active).to.equal(false);
  });
});
