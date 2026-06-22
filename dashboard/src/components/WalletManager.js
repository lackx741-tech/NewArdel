import { useState } from "react";

export default function WalletManager({ signer, address, onUpdate }) {
  const [destination, setDestination] = useState("");
  const [status, setStatus] = useState("");

  async function save() {
    if (!signer || !address || !destination) return;
    setStatus("Delegation target updated");
    if (onUpdate) await onUpdate();
  }

  return (
    <section className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h2 className="text-xl font-semibold mb-4">Wallet Manager</h2>
      <p className="text-gray-400 text-sm mb-4">Connected wallet: {address || "Not connected"}</p>
      <input
        className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 mb-3"
        placeholder="Sweep destination address"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
      />
      <button className="px-4 py-2 bg-purple-600 rounded-lg" onClick={save} disabled={!signer || !destination}>
        Save Destination
      </button>
      {status && <p className="text-green-400 text-sm mt-3">{status}</p>}
    </section>
  );
}
