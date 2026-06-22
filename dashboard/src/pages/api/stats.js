export default function handler(_req, res) {
  res.status(200).json({
    totalSwept: "0",
    totalSweeps: 0,
    activeDelegations: 0,
    botBalance: "0"
  });
}
