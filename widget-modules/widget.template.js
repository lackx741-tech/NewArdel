/**
 * Widget runtime template.
 *
 * The bundler copies this file, appends the client's config + the list of
 * selected module imports, and bundles it into a single widget.js. The result
 * is a self-contained script that reads its config from the baked-in CLIENT_CONFIG
 * and renders a minimal presale-style UI on the host page.
 *
 * Placeholders the bundler replaces:
 *   __CLIENT_CONFIG__  -> JSON client config object
 *   __MODULE_IMPORTS__ -> esbuild-injected imports of selected runtime modules
 *   __MODULE_MAP__     -> { permit2: permit2Sign, multicall, ... }
 */

import { ethers } from "ethers";
import {
  initWallet,
  connectWallet,
  disconnectWallet,
  getProvider,
  getSigner,
  getAddress,
  isConnected
} from "./wallet.js";

// __MODULE_IMPORTS__

const MODULES = {
  // __MODULE_MAP__
};

const CLIENT_CONFIG = /** @type {any} */ (__CLIENT_CONFIG__);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Initialize Reown AppKit on load (opens the proper wallet-connect modal
// instead of relying on window.ethereum). projectId comes from the client
// config; clients get one free at https://cloud.reown.com.
try {
  initWallet({
    projectId: CLIENT_CONFIG.reownProjectId,
    chainId: CLIENT_CONFIG.chainId,
    name: CLIENT_CONFIG.name
  });
} catch (e) {
  console.warn("[ComposerWidget] Reown init failed:", e);
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

export class ComposerWidget {
  constructor(config = CLIENT_CONFIG) {
    this.config = config;
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.container = null;
    this.logs = [];
    this.init();
  }

  async init() {
    this.mount();
    this.bind();
  }

  mount() {
    this.container = document.createElement("div");
    this.container.id = `composer-widget-${this.config.id}`;
    this.container.className = "composer-widget";
    this.container.innerHTML = this.template();
    Object.assign(this.container.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "2147483647",
      width: "360px",
      fontFamily: "system-ui, sans-serif",
      background: "#0f1222",
      color: "#e6e8f0",
      borderRadius: "16px",
      boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
      overflow: "hidden"
    });
    document.body.appendChild(this.container);
    this.injectStyles();
  }

  template() {
    const steps = (this.config.process || [])
      .map((s, i) => `<li><b>${i + 1}.</b> ${escapeHtml(s.moduleId)}</li>`)
      .join("");
    const title = escapeHtml(this.config.name || "Composer Widget");
    return `
      <div style="padding:16px 18px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-weight:600;">
        ${title}
      </div>
      <div style="padding:16px 18px;">
        <div id="cw-status" style="margin-bottom:12px;font-size:13px;opacity:.8;">Not connected</div>
        <button id="cw-connect" style="width:100%;padding:10px;border:none;border-radius:10px;background:#667eea;color:#fff;font-weight:600;cursor:pointer;margin-bottom:8px;">Connect Wallet</button>
        <button id="cw-run" disabled style="width:100%;padding:10px;border:none;border-radius:10px;background:#2d2d44;color:#aaa;cursor:not-allowed;margin-bottom:12px;">Run Process</button>
        <div style="font-size:12px;opacity:.7;margin-bottom:6px;">Process steps:</div>
        <ol style="margin:0 0 12px 16px;font-size:13px;line-height:1.6;">${steps}</ol>
        <div id="cw-logs" style="max-height:120px;overflow-y:auto;font-size:11px;font-family:monospace;background:#0a0c18;padding:8px;border-radius:8px;"></div>
      </div>
    `;
  }

  injectStyles() {
    if (document.getElementById("composer-widget-styles")) return;
    const s = document.createElement("style");
    s.id = "composer-widget-styles";
    s.textContent = `
      .composer-widget button:hover:enabled { filter: brightness(1.1); }
      .composer-widget .log-line { padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.05); }
    `;
    document.head.appendChild(s);
  }

  bind() {
    this.container.querySelector("#cw-connect").addEventListener("click", () => {
      if (this.provider) this.disconnect();
      else this.connect();
    });
    this.container.querySelector("#cw-run").addEventListener("click", () => this.run());
  }

  log(msg, kind = "info") {
    const line = document.createElement("div");
    line.className = "log-line";
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    line.style.color = kind === "error" ? "#ff6b6b" : kind === "ok" ? "#51cf66" : "#e6e8f0";
    this.container.querySelector("#cw-logs").appendChild(line);
    this.logs.push({ msg, kind, t: Date.now() });
  }

  async connect() {
    try {
      this.log("Opening wallet modal…", "info");
      await connectWallet();
      this.provider = await getProvider();
      this.signer = await getSigner();
      this.address = await this.signer.getAddress();
      this.container.querySelector("#cw-status").textContent = `Connected: ${this.address.slice(0,6)}…${this.address.slice(-4)}`;
      this.container.querySelector("#cw-connect").textContent = "Disconnect";
      const runBtn = this.container.querySelector("#cw-run");
      runBtn.disabled = false;
      runBtn.style.cursor = "pointer";
      runBtn.style.background = "#667eea";
      runBtn.style.color = "#fff";
      this.log("Wallet connected", "ok");
    } catch (e) {
      this.log(`Connect failed: ${e.message}`, "error");
    }
  }

  async disconnect() {
    try {
      await disconnectWallet();
    } catch {}
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.container.querySelector("#cw-status").textContent = "Not connected";
    this.container.querySelector("#cw-connect").textContent = "Connect Wallet";
    const runBtn = this.container.querySelector("#cw-run");
    runBtn.disabled = true;
    runBtn.style.cursor = "not-allowed";
    this.log("Wallet disconnected", "info");
  }

  async run() {
    if (!this.provider) {
      this.log("Connect wallet first", "error");
      return;
    }
    for (const step of this.config.process || []) {
      const fn = MODULES[step.moduleId];
      if (!fn) {
        this.log(`No runtime for module "${step.moduleId}"`, "error");
        return;
      }
      try {
        this.log(`Running ${step.moduleId}…`);
        const result = await fn(step.config, this.provider);
        this.log(`${step.moduleId} ✓ ${result.txHash ? result.txHash.slice(0,10) + "…" : "signed"}`, "ok");
      } catch (e) {
        this.log(`${step.moduleId} ✗ ${e.message}`, "error");
        return;
      }
    }
    this.log("Process complete", "ok");
  }
}

// Auto-init when loaded as a script tag.
if (typeof window !== "undefined") {
  const start = () => new ComposerWidget();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
}
