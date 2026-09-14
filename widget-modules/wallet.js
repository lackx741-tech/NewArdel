/**
 * Reown AppKit wallet connection for the widget.
 *
 * Replaces raw window.ethereum with a proper wallet-connect modal (WalletConnect
 * v2 under the hood): supports MetaMask, Coinbase, Trust, WalletConnect QR, etc.
 *
 * The widget runtime calls getProvider()/getSigner() instead of touching
 * window.ethereum directly, so any Reown-supported wallet works.
 *
 * projectId: get one free at https://cloud.reown.com
 */
import { createAppKit } from "@reown/appkit";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { sepolia, mainnet } from "@reown/appkit/networks";
import { ethers } from "ethers";

let appkit = null;
let adapter = null;
let provider = null;

/**
 * Initialize Reown AppKit. Safe to call multiple times; returns the singleton.
 *
 * @param {object} [opts]
 * @param {string} [opts.projectId] Reown Cloud project id.
 * @param {number} [opts.chainId] Preferred chain (must match one in networks).
 * @param {string} [opts.name] App name shown in the wallet modal.
 */
export function initWallet(opts = {}) {
  if (appkit) return appkit;

  if (!opts.projectId) {
    throw new Error("Reown projectId is required. Configure reownProjectId before building the widget.");
  }
  const projectId = opts.projectId;

  // Build the supported networks list. Include mainnet + sepolia by default;
  // the widget's chainId config selects which is active.
  const networks = [sepolia, mainnet];

  adapter = new EthersAdapter();

  appkit = createAppKit({
    adapters: [adapter],
    networks,
    metadata: {
      name: opts.name || "Composer Widget",
      description: "Presale/DeFi transaction widget",
      url: typeof window !== "undefined" ? window.location.origin : "",
      icons: []
    },
    projectId,
    features: {
      analytics: false
    },
    // Use the chain the client config asked for, if present.
    defaultNetwork: networks.find((n) => n.id === Number(opts.chainId)) || sepolia
  });

  return appkit;
}

/**
 * Open the Reown wallet-connect modal. Resolves when a wallet connects.
 */
export async function connectWallet() {
  if (!appkit) initWallet();
  const result = await appkit.open();
  return result;
}

/** Disconnect the current wallet. */
export async function disconnectWallet() {
  if (!appkit) return;
  await appkit.disconnect();
  provider = null;
}

/**
 * Get an ethers v6 BrowserProvider backed by the Reown-connected wallet.
 * Throws if no wallet is connected.
 */
export async function getProvider() {
  if (!appkit) initWallet();
  const wagmiProvider = await appkit.getProvider();
  if (!wagmiProvider) {
    throw new Error("No wallet connected. Call connectWallet() first.");
  }
  provider = new ethers.BrowserProvider(wagmiProvider, "any");
  return provider;
}

/** Get a signer from the connected wallet. */
export async function getSigner() {
  const p = await getProvider();
  return p.getSigner();
}

/** Get the connected account address, or null. */
export async function getAddress() {
  if (!appkit) return null;
  try {
    const p = await appkit.getProvider();
    if (!p) return null;
    const accounts = await p.request({ method: "eth_accounts" });
    return accounts && accounts[0] ? accounts[0] : null;
  } catch {
    return null;
  }
}

/** True if a wallet is currently connected. */
export async function isConnected() {
  const addr = await getAddress();
  return !!addr;
}

export { appkit as getAppKit };
