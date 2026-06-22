require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.23",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY",
      accounts: [process.env.PRIVATE_KEY].filter(Boolean),
      chainId: 1,
      gasPrice: "auto"
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY",
      accounts: [process.env.PRIVATE_KEY].filter(Boolean),
      chainId: 11155111
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/YOUR-API-KEY",
      accounts: [process.env.PRIVATE_KEY].filter(Boolean),
      chainId: 137
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "https://arb-mainnet.g.alchemy.com/v2/YOUR-API-KEY",
      accounts: [process.env.PRIVATE_KEY].filter(Boolean),
      chainId: 42161
    },
    optimism: {
      url: process.env.OPTIMISM_RPC_URL || "https://opt-mainnet.g.alchemy.com/v2/YOUR-API-KEY",
      accounts: [process.env.PRIVATE_KEY].filter(Boolean),
      chainId: 10
    },
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: [process.env.PRIVATE_KEY].filter(Boolean),
      chainId: 8453
    }
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY,
      sepolia: process.env.ETHERSCAN_API_KEY,
      polygon: process.env.POLYGONSCAN_API_KEY,
      arbitrum: process.env.ARBISCAN_API_KEY,
      optimism: process.env.OPTIMISTIC_ETHERSCAN_API_KEY,
      base: process.env.BASESCAN_API_KEY
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD"
  }
};
