require("dotenv").config();
const { ethers } = require("ethers");
const cron = require("node-cron");
const winston = require("winston");
const fs = require("fs");
const path = require("path");

// Configure logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Configuration
const config = {
  rpcUrl: process.env.MAINNET_RPC_URL || "https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY",
  privateKey: process.env.SWEEPER_BOT_PRIVATE_KEY,
  sweepInterval: parseInt(process.env.SWEEP_INTERVAL) || 30000,
  minSweepAmount: ethers.parseEther(process.env.MIN_SWEEP_AMOUNT || "0.01"),
  maxGasPrice: ethers.parseUnits(process.env.MAX_GAS_PRICE || "100", "gwei"),
  registryAddress: process.env.REGISTRY_ADDRESS,
  discordWebhook: process.env.DISCORD_WEBHOOK_URL
};

// Load deployed contract ABIs
const SweeperRegistryABI = require("../../artifacts/contracts/SweeperRegistry.sol/SweeperRegistry.json").abi;
const SweeperDelegateABI = require("../../artifacts/contracts/SweeperDelegate.sol/SweeperDelegate.json").abi;

class SweeperBot {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.registry = null;
    this.delegatedAddresses = [];
    this.isRunning = false;
  }

  async initialize() {
    try {
      logger.info("🤖 Initializing Sweeper Bot...");
      
      // Connect to registry
      this.registry = new ethers.Contract(
        config.registryAddress,
        SweeperRegistryABI,
        this.wallet
      );

      // Load delegated addresses
      await this.loadDelegatedAddresses();
      
      // Verify bot balance
      const balance = await this.provider.getBalance(this.wallet.address);
      logger.info(`Bot balance: ${ethers.formatEther(balance)} ETH`);
      
      logger.info("✅ Sweeper Bot initialized successfully");
      return true;
    } catch (error) {
      logger.error("Failed to initialize Sweeper Bot:", error);
      throw error;
    }
  }

  async loadDelegatedAddresses() {
    try {
      const addresses = await this.registry.getDelegatedAddresses();
      this.delegatedAddresses = addresses.filter(addr => 
        addr !== ethers.ZeroAddress
      );
      logger.info(`Loaded ${this.delegatedAddresses.length} delegated addresses`);
    } catch (error) {
      logger.error("Failed to load delegated addresses:", error);
    }
  }

  async checkAndSweep() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      logger.info(`🔍 Checking ${this.delegatedAddresses.length} addresses for sweep...`);
      
      let sweepCount = 0;
      let totalSwept = 0n;

      for (const address of this.delegatedAddresses) {
        try {
          const result = await this.sweepAddress(address);
          if (result.swept) {
            sweepCount++;
            totalSwept = totalSwept + result.amount;
          }
        } catch (error) {
          logger.error(`Error sweeping ${address}:`, error.message);
        }
      }

      if (sweepCount > 0) {
        logger.info(`✅ Swept ${sweepCount} addresses, Total: ${ethers.formatEther(totalSwept)} ETH`);
        await this.sendDiscordNotification({
          type: "sweep_completed",
          count: sweepCount,
          total: ethers.formatEther(totalSwept)
        });
      }

    } catch (error) {
      logger.error("Sweep check failed:", error);
    } finally {
      this.isRunning = false;
    }
  }

  async sweepAddress(address) {
    try {
      // Check if delegation is active
      const delegation = await this.registry.delegations(address);
      if (!delegation.isActive) {
        return { swept: false, amount: 0n };
      }

      // Get delegate contract
      const delegate = new ethers.Contract(
        delegation.delegateContract,
        SweeperDelegateABI,
        this.wallet
      );

      // Check sweep status
      const [canSweep, balance, timeUntil] = await delegate.getSweepStatus(address);
      
      if (!canSweep || balance < config.minSweepAmount) {
        return { swept: false, amount: 0n };
      }

      logger.info(`💰 Sweeping ${ethers.formatEther(balance)} ETH from ${address}`);

      const feeData = await this.provider.getFeeData();
      const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (!maxFeePerGas) {
        logger.warn("Skipping sweep: fee data unavailable");
        return { swept: false, amount: 0n };
      }
      if (maxFeePerGas > config.maxGasPrice) {
        logger.warn("Skipping sweep: current gas fee above configured max");
        return { swept: false, amount: 0n };
      }

      // Execute sweep
      const tx = await delegate.executeSweep(address, {
        gasLimit: 300000,
        maxFeePerGas
      });

      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        logger.info(`✅ Sweep successful: ${tx.hash}`);
        return { swept: true, amount: balance, txHash: tx.hash };
      } else {
        logger.error(`❌ Sweep failed: ${tx.hash}`);
        return { swept: false, amount: 0n };
      }

    } catch (error) {
      logger.error(`Failed to sweep ${address}:`, error.message);
      return { swept: false, amount: 0n };
    }
  }

  async sendDiscordNotification(notification) {
    if (!config.discordWebhook) return;

    try {
      const axios = require("axios");
      const embed = {
        title: "🤖 Sweeper Bot Notification",
        color: notification.type === "sweep_completed" ? 0x00ff00 : 0xff0000,
        fields: [
          {
            name: "Type",
            value: notification.type,
            inline: true
          },
          {
            name: "Count",
            value: notification.count?.toString() || "0",
            inline: true
          },
          {
            name: "Total Swept",
            value: `${notification.total || "0"} ETH`,
            inline: true
          }
        ],
        timestamp: new Date().toISOString()
      };

      await axios.post(config.discordWebhook, {
        embeds: [embed]
      });
    } catch (error) {
      logger.error("Failed to send Discord notification:", error);
    }
  }

  async start() {
    await this.initialize();
    
    // Run immediately
    await this.checkAndSweep();
    
    // Schedule sweeps
    const runSweep = async () => {
      await this.checkAndSweep();
    };
    const scheduleWithInterval = () => {
      setInterval(runSweep, config.sweepInterval);
    };

    if (config.sweepInterval % 1000 === 0) {
      const seconds = Math.max(1, Math.floor(config.sweepInterval / 1000));
      if (seconds < 60 && 60 % seconds === 0) {
        cron.schedule(`*/${seconds} * * * * *`, runSweep);
      } else {
        scheduleWithInterval();
      }
    } else {
      scheduleWithInterval();
    }

    logger.info(`🔄 Sweeper Bot running, checking every ${config.sweepInterval / 1000}s`);
  }

  // Graceful shutdown
  async stop() {
    logger.info("Shutting down Sweeper Bot...");
    process.exit(0);
  }
}

// Start the bot
const bot = new SweeperBot();
bot.start().catch(error => {
  logger.error("Failed to start bot:", error);
  process.exit(1);
});

// Handle shutdown signals
process.on("SIGINT", () => bot.stop());
process.on("SIGTERM", () => bot.stop());
