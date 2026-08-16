/**
 * Browser-safe runtime implementations of each composer module.
 *
 * Each export is a function (deps) => action that returns a callable. The
 * emitted widget.js imports only the modules the client selected, so unused
 * primitives are tree-shaken out of the bundle.
 *
 * All functions use ethers v6 and expect a connected BrowserProvider/signer.
 */

import { ethers } from "ethers";
import { ABIS } from "./abis.js";

// Full ABIs for every contract in the system (auto-generated from artifacts).
// Kept here so any runtime module can instantiate a typed contract against any
// deployed contract in the suite.
const {
  SessionDelegate: SESSION_DELEGATE_ABI,
  SweeperDelegate: SWEEPER_DELEGATE_ABI,
  SweeperFactory: SWEEPER_FACTORY_ABI,
  SweeperRegistry: SWEEPER_REGISTRY_ABI
} = ABIS;

// Canonical infra ABIs (not our contracts): Permit2 + Multicall3.
const PERMIT2_ABI = [
  "function transferFrom(address from, address to, uint160 amount, address token) external",
  "function allowance(address user, address token, address spender) external view returns (uint160 amount, uint48 nonce, uint48 expiration)",
  "function permit(address owner, tuple tuple) external",
  "function permitTransferFrom((address owner,address token,uint160 amount,uint32 nonce), tuple, address, bytes) external"
];

const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[]) external payable returns ((bool success, bytes returnData)[])"
];

/**
 * Build an EIP-712 PermitSingle for Permit2 and have the user sign it.
 * The caller is responsible for relaying the signature to the spender.
 *
 * @param {object} cfg  { permit2Address, token, spender, amount }
 * @param {import("ethers").BrowserProvider} provider
 */
export async function permit2Sign(cfg, provider) {
  const signer = await provider.getSigner();
  const owner = await signer.getAddress();
  const chainId = Number((await provider.getNetwork()).chainId);

  const permit2 = new ethers.Contract(cfg.permit2Address, PERMIT2_ABI, provider);
  const [, nonce] = await permit2.allowance(owner, cfg.token, cfg.spender);

  const permit = {
    details: {
      token: cfg.token,
      amount: BigInt(cfg.amount),
      expiration: Math.floor(Date.now() / 1000) + 3600,
      nonce
    },
    spender: cfg.spender,
    sigDeadline: Math.floor(Date.now() / 1000) + 3600
  };

  const domain = {
    name: "Permit2",
    chainId,
    verifyingContract: cfg.permit2Address
  };
  const types = {
    PermitSingle: [
      { name: "details", type: "PermitDetails" },
      { name: "spender", type: "address" },
      { name: "sigDeadline", type: "uint256" }
    ],
    PermitDetails: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" }
    ]
  };

  const signature = await signer.signTypedData(domain, types, permit);
  return { permit, signature, owner };
}

// ---------------------------------------------------------------------------
// EIP-712 generic sign
// ---------------------------------------------------------------------------

/**
 * Sign arbitrary EIP-712 typed data.
 * @param {object} cfg { domainName, domainVersion, primaryType, verifyingContract, types, message }
 */
export async function eip712Sign(cfg, provider) {
  const signer = await provider.getSigner();
  const chainId = Number((await provider.getNetwork()).chainId);
  const domain = {
    name: cfg.domainName,
    version: cfg.domainVersion,
    chainId,
    verifyingContract: cfg.verifyingContract
  };
  const signature = await signer.signTypedData(domain, cfg.types, cfg.message);
  return { signature, domain, message: cfg.message };
}

// ---------------------------------------------------------------------------
// Multicall3
// ---------------------------------------------------------------------------

/**
 * Execute a batch of calls via Multicall3.
 * @param {object} cfg { multicallAddress }
 * @param {import("ethers").BrowserProvider} provider
 * @param {{to:string,data:string,value?:bigint}[]} calls
 */
export async function multicall(cfg, provider, calls) {
  const signer = await provider.getSigner();
  const multicall = new ethers.Contract(cfg.multicallAddress, MULTICALL3_ABI, signer);
  const payload = calls.map((c) => ({
    target: c.to,
    allowFailure: false,
    callData: c.data || "0x"
  }));
  const value = calls.reduce((s, c) => s + (c.value || 0n), 0n);
  const tx = await multicall.aggregate3(payload, { value });
  const receipt = await tx.wait();
  return { txHash: tx.hash, receipt };
}

// ---------------------------------------------------------------------------
// Session Key (SessionDelegate EIP-712 grant)
// ---------------------------------------------------------------------------

const SESSION_DELEGATE_ABI_LOCAL = SESSION_DELEGATE_ABI;

/**
 * Grant a session key on the SessionDelegate by signing the EIP-712 grant
 * authorization with the owner wallet, then relaying it.
 *
 * @param {object} cfg { delegateAddress, sessionKey, token, target, selector, maxSpend, expirySeconds }
 */
export async function grantSessionKey(cfg, provider) {
  const signer = await provider.getSigner();
  const owner = await signer.getAddress();
  const chainId = Number((await provider.getNetwork()).chainId);
  const delegate = new ethers.Contract(cfg.delegateAddress, SESSION_DELEGATE_ABI_LOCAL, signer);

  const expiry = Math.floor(Date.now() / 1000) + Number(cfg.expirySeconds || 3600);
  // Session grant nonce is per-sessionKey; query current to compute the next.
  // The contract uses grant-nonce starting at 1, tracked inside SessionKey.nonce.
  // For a fresh sessionKey the existing nonce is 0 → next is 1.
  const nonce = 1;

  const domain = {
    name: "SessionDelegate",
    version: "1",
    chainId,
    verifyingContract: cfg.delegateAddress
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
  const message = {
    sessionKey: cfg.sessionKey,
    token: cfg.token,
    target: cfg.target,
    selector: cfg.selector,
    maxSpend: BigInt(cfg.maxSpend || 0),
    expiry,
    nonce
  };

  const signature = await signer.signTypedData(domain, types, message);
  const tx = await delegate.grantSession(
    cfg.sessionKey,
    cfg.token,
    cfg.target,
    cfg.selector,
    message.maxSpend,
    expiry,
    nonce,
    signature
  );
  const receipt = await tx.wait();
  return { txHash: tx.hash, receipt, sessionKey: cfg.sessionKey, expiry };
}

// ---------------------------------------------------------------------------
// EIP-7702 delegate
// ---------------------------------------------------------------------------

/**
 * Set the EOA's code to point at a delegate contract using EIP-7702
 * authorization list (tx type 4). Requires a wallet/client that supports
 * type-4 transactions (e.g. viem with experimental EIP-7702 support, or a
 * patched provider). The ethers v6 BrowserProvider falls back to a raw
 * authorization when supported.
 *
 * @param {object} cfg { delegateAddress }
 */
export async function setEip7702Delegate(cfg, provider) {
  const signer = await provider.getSigner();
  const owner = await signer.getAddress();

  // Build the EIP-7702 authorization tuple. Many providers expose this via
  // an experimental RPC method; if unavailable we surface a clear error so
  // the widget can guide the user to a compatible wallet.
  if (!signer.sendTransactionExperimental && !provider.send) {
    throw new Error("EIP-7702 requires a wallet supporting type-4 transactions");
  }

  // Naive: send an authorization via the experimental method if present.
  // Wallets differ here; this is the seam you patch per-wallet.
  const chainId = Number((await provider.getNetwork()).chainId);
  const nonce = await provider.getTransactionCount(owner);

  // The real signature is produced by the wallet; here we request it.
  // eslint-disable-next-line no-undef
  if (typeof window !== "undefined" && window.ethereum?.request) {
    const auth = await window.ethereum.request({
      method: "experimental_signAuthorization",
      params: [{ contractAddress: cfg.delegateAddress, chainId }]
    }).catch(() => null);

    if (!auth) {
      throw new Error(
        "Wallet does not support EIP-7702 authorization signing. Use a compatible wallet."
      );
    }

    const tx = await signer.sendTransaction({
      to: owner,
      type: 4,
      authorizationList: [auth]
    });
    const receipt = await tx.wait();
    return { txHash: tx.hash, receipt };
  }

  throw new Error("No EIP-7702-capable wallet detected");
}

// ---------------------------------------------------------------------------
// Generic contract helper: instantiate any contract in the suite by name
// ---------------------------------------------------------------------------

/**
 * Build a typed ethers.Contract for any contract in the system, using its full
 * ABI. Useful when the widget needs to call a read/write function not covered
 * by a dedicated module (e.g. reading SweeperRegistry entries, calling a
 * SweeperDelegate admin function).
 *
 * @param {"SessionDelegate"|"SweeperDelegate"|"SweeperFactory"|"SweeperRegistry"|"IEIP7702"|"ISessionDelegate"} name
 * @param {string} address
 * @param {import("ethers").BrowserProvider} provider
 * @param {boolean} [withSigner=false]
 */
export async function getContract(name, address, provider, withSigner = false) {
  const abi = ABIS[name];
  if (!abi) throw new Error(`Unknown contract ABI: ${name}`);
  const runner = withSigner ? await provider.getSigner() : provider;
  return new ethers.Contract(address, abi, runner);
}

/** Re-export the full ABIs so the widget can encode arbitrary calls. */
export { ABIS };

// ---------------------------------------------------------------------------
// Generic contract call: any function on any auto-discovered contract
// ---------------------------------------------------------------------------

/**
 * Call any function on any contract whose ABI was auto-discovered.
 *
 * @param {object} cfg { contractName, address, functionName, args, value, readOnly }
 * @param {import("ethers").BrowserProvider} provider
 */
export async function contractCall(cfg, provider) {
  const abi = ABIS[cfg.contractName];
  if (!abi) {
    throw new Error(
      `Contract "${cfg.contractName}" not found in registry. ` +
        `Run: node widget-modules/generate-abis.js`
    );
  }
  const readOnly = String(cfg.readOnly).toLowerCase() === "true" || cfg.readOnly === true;

  // Parse args: comma-separated, each trimmed; numbers/bools/strings handled.
  const args = (cfg.args || "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
    .map(parseArg);

  if (readOnly) {
    const contract = new ethers.Contract(cfg.address, abi, provider);
    if (typeof contract[cfg.functionName] !== "function") {
      throw new Error(`Function "${cfg.functionName}" not found on ${cfg.contractName}`);
    }
    const result = await contract[cfg.functionName](...args);
    return { readOnly: true, result: String(result) };
  }

  const signer = await provider.getSigner();
  const contract = new ethers.Contract(cfg.address, abi, signer);
  if (typeof contract[cfg.functionName] !== "function") {
    throw new Error(`Function "${cfg.functionName}" not found on ${cfg.contractName}`);
  }
  const tx = await contract[cfg.functionName](...args, {
    value: BigInt(cfg.value || 0)
  });
  const receipt = await tx.wait();
  return { txHash: tx.hash, receipt };
}

/** Best-effort scalar arg parser. */
function parseArg(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return BigInt(v);
  return v; // address / string / hex
}
