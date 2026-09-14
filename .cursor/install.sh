#!/usr/bin/env bash
# Idempotent bootstrap for the EIP-7702 Sweeper System monorepo.
# Runs after the repository is checked out. Safe to run repeatedly.
set -euo pipefail

cd "$(dirname "$0")/.."

# Root Hardhat workspace (contracts, tests, deploy scripts).
npm install

# Each sub-project keeps its own package.json + lockfile.
( cd dashboard && npm install )
( cd cdn-widget && npm install )
( cd backend/monitoring && npm install )
( cd backend/sweeper-bot && npm install )

# Compile contracts and (re)generate widget ABIs. Both outputs are gitignored,
# source-derived state: Hardhat artifacts are required by the sweeper bot at
# load time, and widget-modules/{abis.js,contracts.json,contracts.registry.js}
# power the dashboard's contract/ABI-aware builder.
npx hardhat compile
node widget-modules/generate-abis.js
