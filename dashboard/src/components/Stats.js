export default function Stats({ stats }) {
  const cards = [
    { label: "Total Swept", value: `${stats.totalSwept} ETH` },
    { label: "Total Sweeps", value: stats.totalSweeps },
    { label: "Active Delegations", value: stats.activeDelegations },
    { label: "Bot Balance", value: `${stats.botBalance} ETH` }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">{card.label}</p>
          <p className="text-xl font-semibold mt-1">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
