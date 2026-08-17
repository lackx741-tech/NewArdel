/**
 * Serves the auto-generated contract registry so the dashboard (and external
 * tools) can enumerate every contract and its callable functions.
 *
 * The registry is regenerated from Hardhat artifacts by:
 *   node widget-modules/generate-abis.js
 */
import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const registryPath = path.join(REPO_ROOT, "widget-modules", "contracts.json");

export default function handler(_req, res) {
  if (!fs.existsSync(registryPath)) {
    return res.status(503).json({
      error: "Contract registry not generated. Run: node widget-modules/generate-abis.js",
      contracts: []
    });
  }
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  res.setHeader("Cache-Control", "no-cache");
  res.status(200).json(registry);
}
