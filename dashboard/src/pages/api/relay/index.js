const path = require("path");
const { pathToFileURL } = require("url");

// Dynamically import the shared ESM intent module (the dashboard is CJS;
// the bundler/runtime are ESM). Per-request import keeps it cache-free.
async function loadIntents() {
  const file = path.join(process.cwd(), "..", "widget-modules", "intents.js");
  const url = pathToFileURL(file).href;
  return import(url);
}

/**
 * POST /api/relay
 *
 * Receives a signed EIP-712 intent produced by the widget's signIntent /
 * signBatchIntent, verifies the signature server-side against the on-chain
 * UniversalDelegate owner(), and returns the assembled executeWithSignature
 * calldata for the operator to review and submit.
 *
 * Per the project rule "no autonomous deployment — user reviews everything",
 * this endpoint does NOT auto-submit by default. Set RELAYER_PRIVATE_KEY in
 * the environment to enable auto-submission (the relayer pays gas).
 *
 * Body: { intent, chainId?, autoSubmit? }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const intent = body && body.intent;
  if (!intent || !intent.delegateAddress || !intent.signature) {
    return res.status(400).json({ error: "Missing intent (delegateAddress + signature required)" });
  }

  let intents;
  try {
    intents = await loadIntents();
  } catch (e) {
    return res.status(500).json({ error: "Intent module unavailable: " + e.message });
  }

  const { verifyIntent, buildRelayCalldata, UNIVERSAL_DELEGATE } = intents;
  const chainId = Number(body.chainId || intent.chainId || UNIVERSAL_DELEGATE.chainId);

  // Resolve the on-chain owner of this UniversalDelegate instance.
  let onChainOwner;
  try {
    onChainOwner = await readOnChainOwner(intent.delegateAddress, chainId);
  } catch (e) {
    return res.status(502).json({
      error: "Failed to read on-chain owner: " + e.message,
      delegateAddress: intent.delegateAddress,
      chainId
    });
  }

  const recovered = verifyIntent(intent, chainId, onChainOwner);
  if (!recovered) {
    return res.status(401).json({
      error: "Signature does not recover to on-chain owner",
      onChainOwner
    });
  }

  const calldata = buildRelayCalldata(intent);
  const result = {
    ok: true,
    verified: true,
    signer: recovered,
    onChainOwner,
    delegateAddress: intent.delegateAddress,
    chainId,
    intentType: intent.type,
    calldata,
    to: intent.delegateAddress
  };

  // Auto-submit only if an operator explicitly enabled it with a funded key.
  const relayerKey = process.env.RELAYER_PRIVATE_KEY;
  const wantAuto = body.autoSubmit === true;
  if (wantAuto && relayerKey) {
    try {
      const txHash = await submitRelay(intent, calldata, chainId, relayerKey);
      result.txHash = txHash;
      result.submitted = true;
    } catch (e) {
      result.submitted = false;
      result.submitError = e.message;
      return res.status(502).json(result);
    }
  } else if (wantAuto && !relayerKey) {
    result.submitted = false;
    result.submitError = "Auto-submit requested but RELAYER_PRIVATE_KEY not configured (review mode only)";
  } else {
    result.submitted = false;
    result.note =
      "Intent verified and calldata assembled for review. Submit `calldata` to `to` on chain " +
      chainId + " to execute. Set RELAYER_PRIVATE_KEY + autoSubmit:true to relay automatically.";
  }

  return res.status(200).json(result);
}

// --- helpers (dependency-free so the API route stays light) ---

const RPC = {
  1: "https://eth.llamarpc.com",
  11155111: "https://rpc.sepolia.org",
  8453: "https://mainnet.base.org",
  10: "https://mainnet.optimism.io"
};

const OWNER_SELECTOR = "0x8da5cb5b"; // owner()

async function readOnChainOwner(delegateAddress, chainId) {
  const rpc = RPC[chainId];
  if (!rpc) throw new Error(`No RPC configured for chainId ${chainId}`);
  const resp = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: delegateAddress, data: OWNER_SELECTOR }, "latest"]
    })
  });
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message);
  const hex = json.result || "0x";
  if (hex.length < 66) throw new Error("Empty owner() response");
  return "0x" + hex.slice(26, 66).toLowerCase();
}

async function submitRelay(intent, calldata, chainId, privateKey) {
  const { ethers } = await import("ethers");
  const rpc = RPC[chainId];
  if (!rpc) throw new Error(`No RPC for chainId ${chainId}`);
  const wallet = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(rpc));
  const tx = await wallet.sendTransaction({ to: intent.delegateAddress, data: calldata });
  return tx.hash;
}

export const config = { api: { bodyParser: true } };
