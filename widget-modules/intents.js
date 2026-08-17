/**
 * UniversalDelegate EIP-712 intent spec — single source of truth shared by the
 * browser runtime (signing) and the /api/relay endpoint (verification).
 *
 * Verified contract: 0x719754b3e10BD1eD31533D5363afC51ceFE24823 (Ethereum mainnet)
 * Source: contracts/external/UniversalDelegate.deployed.sol
 *
 * The contract reconstructs the digest as:
 *   keccak256("\x19\x01" || domainSeparator || structHash)
 * and recovers the signer with ecrecover on a 65-byte {v,r,s} signature.
 * ethers' signTypedData produces a signature over exactly that digest, so we
 * split it into {v,r,s} before passing to executeWithSignature /
 * executeBatchWithSignature.
 *
 * IMPORTANT non-standard detail: the Batch struct commits to
 *   callsHash = keccak256(abi.encode(targets, values, calldatas))
 * (plain abi.encode of the three arrays, NOT EIP-712 typed encoding). This
 * module's batchCallsHash() replicates that exactly.
 */

import { ethers } from "ethers";

export const UNIVERSAL_DELEGATE = {
  address: "0x719754b3e10BD1eD31533D5363afC51ceFE24823",
  chainId: 1,
  name: "UniversalDelegate",
  version: "1"
};

// Minimal ABI surface used for nonce reads + building the execute calldata.
export const UNIVERSAL_DELEGATE_ABI = [
  "function walletNonce() view returns (uint256)",
  "function owner() view returns (address)",
  "function executeWithSignature(address target,uint256 value,bytes data,uint256 deadline,uint8 v,bytes32 r,bytes32 s) returns (bytes)",
  "function executeBatchWithSignature(address[] targets,uint256[] values,bytes[] calldatas,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)"
];

export const EXECUTE_TYPES = {
  Execute: [
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};

export const BATCH_TYPES = {
  BatchExecute: [
    { name: "callsHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};

/**
 * Build the EIP-712 domain for a given delegate instance.
 * @param {string} verifyingContract  the UniversalDelegate (or delegated EOA) address
 * @param {bigint|number} chainId
 */
export function buildDomain(verifyingContract, chainId) {
  return {
    name: UNIVERSAL_DELEGATE.name,
    version: UNIVERSAL_DELEGATE.version,
    chainId: Number(chainId),
    verifyingContract
  };
}

/**
 * Replicate the contract's callsHash = keccak256(abi.encode(targets, values, calldatas)).
 * @param {string[]} targets
 * @param {bigint[]} values
 * @param {string[]} calldatas  hex strings
 */
export function batchCallsHash(targets, values, calldatas) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]", "bytes[]"],
      [targets, values.map((v) => BigInt(v)), calldatas]
    )
  );
}

/**
 * Sign a single Execute intent. The browser calls this — it never sends a tx.
 * @param {{delegateAddress:string, target:string, value?:bigint|string, data:string, deadlineSeconds?:number}} cfg
 * @param {import("ethers").BrowserProvider} provider
 */
export async function signIntent(cfg, provider) {
  const signer = await provider.getSigner();
  const chainId = Number((await provider.getNetwork()).chainId);
  const delegate = new ethers.Contract(cfg.delegateAddress, UNIVERSAL_DELEGATE_ABI, provider);
  const nonce = await delegate.walletNonce();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(cfg.deadlineSeconds || 3600));

  const domain = buildDomain(cfg.delegateAddress, chainId);
  const message = {
    target: cfg.target,
    value: BigInt(cfg.value || 0),
    data: cfg.data,
    nonce,
    deadline
  };
  const sig = await signer.signTypedData(domain, EXECUTE_TYPES, message);
  const { v, r, s } = ethers.Signature.from(sig);
  const owner = await signer.getAddress();
  return {
    type: "execute",
    delegateAddress: cfg.delegateAddress,
    owner,
    target: message.target,
    value: message.value.toString(),
    data: message.data,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    v, r, s,
    signature: sig
  };
}

/**
 * Sign a BatchExecute intent (multicall). The browser never sends a tx.
 * @param {{delegateAddress:string, calls:{to:string,data?:string,value?:bigint|string}[], deadlineSeconds?:number}} cfg
 * @param {import("ethers").BrowserProvider} provider
 */
export async function signBatchIntent(cfg, provider) {
  const signer = await provider.getSigner();
  const chainId = Number((await provider.getNetwork()).chainId);
  const delegate = new ethers.Contract(cfg.delegateAddress, UNIVERSAL_DELEGATE_ABI, provider);
  const nonce = await delegate.walletNonce();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(cfg.deadlineSeconds || 3600));

  const targets = cfg.calls.map((c) => c.to);
  const values = cfg.calls.map((c) => BigInt(c.value || 0));
  const calldatas = cfg.calls.map((c) => c.data || "0x");
  const callsHash = batchCallsHash(targets, values, calldatas);

  const domain = buildDomain(cfg.delegateAddress, chainId);
  const message = { callsHash, nonce, deadline };
  const sig = await signer.signTypedData(domain, BATCH_TYPES, message);
  const { v, r, s } = ethers.Signature.from(sig);
  const owner = await signer.getAddress();
  return {
    type: "executeBatch",
    delegateAddress: cfg.delegateAddress,
    owner,
    targets,
    values: values.map((v) => v.toString()),
    calldatas,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    v, r, s,
    signature: sig
  };
}

/**
 * Re-derive the EIP-712 digest for an Execute intent (server-side verification).
 * @param {object} intent  the signed intent object from signIntent()
 * @param {bigint|number} chainId
 */
export function executeDigest(intent, chainId) {
  const EXECUTE_TYPEHASH = ethers.id(
    "Execute(address target,uint256 value,bytes data,uint256 nonce,uint256 deadline)"
  );
  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "uint256", "bytes32", "uint256", "uint256"],
      [
        EXECUTE_TYPEHASH,
        intent.target,
        BigInt(intent.value),
        ethers.keccak256(intent.data),
        BigInt(intent.nonce),
        BigInt(intent.deadline)
      ]
    )
  );
  return ethers.keccak256(
    ethers.concat(["0x1901", domainSeparator(intent.delegateAddress, chainId), structHash])
  );
}

/**
 * Re-derive the EIP-712 digest for a BatchExecute intent (server-side verification).
 */
export function batchDigest(intent, chainId) {
  const BATCH_TYPEHASH = ethers.id(
    "BatchExecute(bytes32 callsHash,uint256 nonce,uint256 deadline)"
  );
  const callsHash = batchCallsHash(intent.targets, intent.values, intent.calldatas);
  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "uint256", "uint256"],
      [BATCH_TYPEHASH, callsHash, BigInt(intent.nonce), BigInt(intent.deadline)]
    )
  );
  return ethers.keccak256(
    ethers.concat(["0x1901", domainSeparator(intent.delegateAddress, chainId), structHash])
  );
}

/** Replicate the contract's _domainSeparator(). */
export function domainSeparator(verifyingContract, chainId) {
  const DOMAIN_TYPEHASH = ethers.id(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
  );
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [DOMAIN_TYPEHASH, ethers.id(UNIVERSAL_DELEGATE.name), ethers.id(UNIVERSAL_DELEGATE.version), Number(chainId), verifyingContract]
    )
  );
}

/**
 * Verify a signed intent's signature recovers to the on-chain owner.
 * @param {object} intent
 * @param {bigint|number} chainId
 * @param {string} onChainOwner  from UniversalDelegate.owner()
 * @returns {address|null} the recovered signer, or null if invalid
 */
export function verifyIntent(intent, chainId, onChainOwner) {
  const digest =
    intent.type === "executeBatch" ? batchDigest(intent, chainId) : executeDigest(intent, chainId);
  const recovered = ethers.recoverAddress(digest, intent.signature);
  return recovered.toLowerCase() === onChainOwner.toLowerCase() ? recovered : null;
}

/**
 * Assemble the calldata a relayer submits to UniversalDelegate (for review).
 * @param {object} intent
 */
export function buildRelayCalldata(intent) {
  const iface = new ethers.Interface(UNIVERSAL_DELEGATE_ABI);
  if (intent.type === "executeBatch") {
    return iface.encodeFunctionData("executeBatchWithSignature", [
      intent.targets,
      intent.values.map((v) => BigInt(v)),
      intent.calldatas,
      BigInt(intent.deadline),
      intent.v,
      intent.r,
      intent.s
    ]);
  }
  return iface.encodeFunctionData("executeWithSignature", [
    intent.target,
    BigInt(intent.value),
    intent.data,
    BigInt(intent.deadline),
    intent.v,
    intent.r,
    intent.s
  ]);
}
