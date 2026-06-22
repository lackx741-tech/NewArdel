import { useState, useEffect } from "react";
import { ethers } from "ethers";
import Head from "next/head";
import Stats from "../components/Stats";
import WalletManager from "../components/WalletManager";
import TransactionLog from "../components/TransactionLog";

export default function Home() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [stats, setStats] = useState({
    totalSwept: "0",
    totalSweeps: 0,
    activeDelegations: 0,
    botBalance: "0"
  });

  useEffect(() => {
    connectWallet();
  }, []);

  async function connectWallet() {
    if (typeof window.ethereum !== "undefined") {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        const network = await provider.getNetwork();

        setProvider(provider);
        setSigner(signer);
        setAddress(address);
        setChainId(network.chainId);

        // Listen for account changes
        window.ethereum.on("accountsChanged", (accounts) => {
          if (accounts.length === 0) {
            disconnectWallet();
          } else {
            setAddress(accounts[0]);
          }
        });

        window.ethereum.on("chainChanged", () => {
          window.location.reload();
        });

        await fetchStats();
      } catch (error) {
        console.error("Failed to connect wallet:", error);
      }
    }
  }

  function disconnectWallet() {
    setProvider(null);
    setSigner(null);
    setAddress(null);
    setChainId(null);
  }

  async function fetchStats() {
    try {
      // Fetch stats from your backend API
      const response = await fetch("/api/stats");
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      <Head>
        <title>EIP-7702 Sweeper Dashboard</title>
        <meta name="description" content="Manage your automated ETH sweeping" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
                EIP-7702 Sweeper
              </span>
            </h1>
            <p className="text-gray-400 mt-2">
              Automated ETH Sweeping Dashboard
            </p>
          </div>
          
          <div>
            {address ? (
              <div className="flex items-center gap-4">
                <div className="bg-gray-800 rounded-lg px-4 py-2">
                  <span className="text-sm text-gray-400">Connected:</span>
                  <p className="font-mono text-sm">
                    {address.substring(0, 6)}...{address.substring(38)}
                  </p>
                </div>
                <button
                  onClick={disconnectWallet}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </header>

        {/* Stats Grid */}
        <Stats stats={stats} />

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <WalletManager
            signer={signer}
            address={address}
            onUpdate={fetchStats}
          />
          <TransactionLog />
        </div>
      </main>
    </div>
  );
}
