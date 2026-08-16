/**
 * Returns the full ABI for a single contract by name.
 *   GET /api/contracts/[name]/abi
 */
import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const abisPath = path.join(REPO_ROOT, "widget-modules", "abis.js");

function loadAbis() {
  if (!fs.existsSync(abisPath)) return null;
  // abis.js is an ES module exporting `ABIS`. Parse the JSON object out of it.
  const raw = fs.readFileSync(abisPath, "utf8");
  const match = raw.match(/export const ABIS = (\{[\s\S]*?\});\n\nexport default ABIS;/);
  if (!match) return null;
  return JSON.parse(match[1]);
}

export default function handler(req, res) {
  const { name } = req.query;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Contract name required" });
  }
  const abis = loadAbis();
  if (!abis) {
    return res.status(503).json({
      error: "ABIs not generated. Run: node widget-modules/generate-abis.js"
    });
  }
  const abi = abis[name];
  if (!abi) {
    return res.status(404).json({
      error: `Contract "${name}" not found`,
      available: Object.keys(abis)
    });
  }
  res.setHeader("Cache-Control", "no-cache");
  res.status(200).json({ name, abi });
}
