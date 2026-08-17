/**
 * Module registry + standard module shape for the widget composer.
 *
 * A "module" is a reusable on-chain action primitive (Permit2 sign, Multicall,
 * SessionKey grant, EIP-712 sign, EIP-7702 delegate). The dashboard composes
 * an ordered list of modules into a "process", configures them per-client,
 * and the bundler emits a single widget.js that runs only the selected modules.
 */

// ============ Module catalog ============

/** @type {import("./types").ComposerModule[]} */
const MODULES = [
  {
    id: "permit2",
    name: "Permit2 Sign",
    category: "sign",
    description:
      "Off-chain Permit2 signature transferring token allowance to a spender without a separate approve tx.",
    fields: [
      {
        key: "permit2Address",
        label: "Permit2 Address",
        type: "address",
        required: true,
        default: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        description: "Canonical Permit2 address (same on all chains)."
      },
      { key: "token", label: "Token Address", type: "address", required: true },
      { key: "spender", label: "Spender", type: "address", required: true },
      { key: "amount", label: "Amount (raw)", type: "uint256", required: true, default: "0" }
    ],
    runtimeDeps: []
  },
  {
    id: "eip712",
    name: "EIP-712 Sign",
    category: "sign",
    description:
      "Generic EIP-712 typed-data signature. Use for custom authorizations your contract verifies.",
    fields: [
      { key: "domainName", label: "Domain Name", type: "string", required: true, default: "SessionDelegate" },
      { key: "domainVersion", label: "Domain Version", type: "string", required: true, default: "1" },
      { key: "primaryType", label: "Primary Type", type: "string", required: true, default: "SessionGrant" },
      { key: "verifyingContract", label: "Verifying Contract", type: "address", required: true }
    ],
    runtimeDeps: []
  },
  {
    id: "multicall",
    name: "Multicall",
    category: "batch",
    description:
      "Batch multiple contract calls into a single transaction using Multicall3.",
    fields: [
      {
        key: "multicallAddress",
        label: "Multicall3 Address",
        type: "address",
        required: true,
        default: "0xcA11bde05977b3631167028862bE2a173976CA11",
        description: "Canonical Multicall3 address (same on all chains)."
      }
    ],
    runtimeDeps: []
  },
  {
    id: "sessionKey",
    name: "Session Key",
    category: "session",
    description:
      "Grant a scoped, time-limited, spend-capped session key via the SessionDelegate EIP-712 flow.",
    fields: [
      { key: "delegateAddress", label: "SessionDelegate Address", type: "address", required: true },
      { key: "sessionKey", label: "Session Key (EOA)", type: "address", required: true },
      { key: "token", label: "Scoped Token (0x0 = native/any)", type: "address", required: true, default: "0x0000000000000000000000000000000000000000" },
      { key: "target", label: "Scoped Target (0x0 = any)", type: "address", required: true, default: "0x0000000000000000000000000000000000000000" },
      { key: "selector", label: "Scoped Selector (0x00000000 = any)", type: "selector", required: true, default: "0x00000000" },
      { key: "maxSpend", label: "Max Spend (raw)", type: "uint256", required: true, default: "0" },
      { key: "expirySeconds", label: "Expiry (seconds from now)", type: "uint256", required: true, default: "3600" }
    ],
    runtimeDeps: ["eip712"]
  },
  {
    id: "eip7702",
    name: "EIP-7702 Delegate",
    category: "delegate",
    description:
      "Set the EOA's code to point at a delegate contract (SessionDelegate) for the transaction, enabling smart-account behavior.",
    fields: [
      { key: "delegateAddress", label: "Delegate Address", type: "address", required: true }
    ],
    runtimeDeps: []
  },
  {
    id: "contractCall",
    name: "Contract Call",
    category: "batch",
    description:
      "Call any function on any auto-discovered contract (read or write). Pick the contract + function in the dashboard; the widget resolves the ABI and encodes the call. This is how new contracts you add become usable without a dedicated module.",
    fields: [
      {
        key: "contractName",
        label: "Contract (from registry)",
        type: "string",
        required: true,
        description: "Name of a contract under contracts/. Auto-discovered on regenerate."
      },
      { key: "address", label: "Deployed Address", type: "address", required: true },
      {
        key: "functionName",
        label: "Function name",
        type: "string",
        required: true,
        description: "Exact function name as declared in the contract."
      },
      {
        key: "args",
        label: "Arguments (comma-separated, JSON-encodable)",
        type: "string",
        required: false,
        default: "",
        description: "e.g. 0xabc,1000000000000000000. Use the arg order from the ABI."
      },
      {
        key: "value",
        label: "ETH value (wei)",
        type: "uint256",
        required: false,
        default: "0"
      },
      {
        key: "readOnly",
        label: "Read-only (eth_call, no tx)",
        type: "boolean",
        required: false,
        default: "false"
      },
      {
        key: "delegateAddress",
        label: "UniversalDelegate Address (route write as EIP-712 intent)",
        type: "address",
        required: false,
        default: "0x719754b3e10BD1eD31533D5363afC51ceFE24823",
        description:
          "When set, writes are signed as an off-chain EIP-712 Execute intent and relayed — the browser never sends a transaction. Leave blank to use the legacy direct-send path (not recommended)."
      },
      { key: "deadlineSeconds", label: "Intent deadline (seconds from now)", type: "uint256", required: false, default: "3600" },
      { key: "relayUrl", label: "Relay URL", type: "string", required: false, default: "/api/relay" },
      { key: "chainId", label: "Chain ID", type: "uint256", required: false, default: "1" },
      { key: "autoSubmit", label: "Auto-submit (needs RELAYER_PRIVATE_KEY)", type: "boolean", required: false, default: "false" }
    ],
    runtimeDeps: []
  },
  {
    id: "signIntent",
    name: "Sign Execute Intent (EIP-712)",
    category: "intent",
    description:
      "Sign an off-chain EIP-712 Execute intent authorizing UniversalDelegate to perform one call. The browser NEVER sends a transaction — the intent is relayed to /api/relay for verification and review. Use this for every client-side write.",
    fields: [
      {
        key: "delegateAddress",
        label: "UniversalDelegate Address",
        type: "address",
        required: true,
        default: "0x719754b3e10BD1eD31533D5363afC51ceFE24823",
        description: "Deployed mainnet UniversalDelegate (or a delegated EOA)."
      },
      { key: "target", label: "Target contract/address", type: "address", required: true },
      { key: "value", label: "ETH value (wei)", type: "uint256", required: false, default: "0" },
      {
        key: "data",
        label: "Calldata (hex)",
        type: "string",
        required: true,
        description: "Encoded function call. Use a contractCall read or the ABI encoder."
      },
      { key: "deadlineSeconds", label: "Deadline (seconds from now)", type: "uint256", required: false, default: "3600" }
    ],
    runtimeDeps: []
  },
  {
    id: "signBatchIntent",
    name: "Sign Batch Intent (EIP-712 multicall)",
    category: "intent",
    description:
      "Sign an off-chain EIP-712 BatchExecute intent authorizing UniversalDelegate to perform multiple calls atomically. callsHash commits to keccak256(abi.encode(targets, values, calldatas)). No transaction is sent from the browser.",
    fields: [
      {
        key: "delegateAddress",
        label: "UniversalDelegate Address",
        type: "address",
        required: true,
        default: "0x719754b3e10BD1eD31533D5363afC51ceFE24823"
      },
      {
        key: "calls",
        label: "Calls (JSON: [{to,data,value}])",
        type: "string",
        required: true,
        description: 'e.g. [{"to":"0xabc","data":"0x...","value":"0"}]'
      },
      { key: "deadlineSeconds", label: "Deadline (seconds from now)", type: "uint256", required: false, default: "3600" }
    ],
    runtimeDeps: []
  },
  {
    id: "relayIntent",
    name: "Relay Intent (verify + review)",
    category: "intent",
    description:
      "Submit a signed intent to the dashboard relayer. Server re-derives the EIP-712 digest, verifies it recovers to the on-chain owner(), and returns the assembled executeWithSignature calldata for operator review. Auto-submits only if RELAYER_PRIVATE_KEY is set.",
    fields: [
      { key: "relayUrl", label: "Relay URL", type: "string", required: false, default: "/api/relay" },
      { key: "chainId", label: "Chain ID", type: "uint256", required: false, default: "1" },
      { key: "autoSubmit", label: "Auto-submit (needs RELAYER_PRIVATE_KEY)", type: "boolean", required: false, default: "false" }
    ],
    runtimeDeps: ["signIntent"]
  }
];

function getModule(id) {
  return MODULES.find((m) => m.id === id);
}

function listModules() {
  return MODULES;
}

/**
 * Resolve the full set of module ids needed by a process, including transitive
 * runtimeDeps. Used by the bundler to know which modules to include.
 * @param {string[]} processModuleIds
 * @returns {string[]}
 */
function resolveDependencies(processModuleIds) {
  const set = new Set();
  const visit = (id) => {
    if (set.has(id)) return;
    const mod = getModule(id);
    if (!mod) throw new Error(`Unknown module: ${id}`);
    for (const dep of mod.runtimeDeps) visit(dep);
    set.add(id);
  };
  for (const id of processModuleIds) visit(id);
  return Array.from(set);
}

module.exports = { MODULES, getModule, listModules, resolveDependencies };
