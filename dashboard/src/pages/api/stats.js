import fs from "fs";
import path from "path";
import { listModules } from "../../composer/modules";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export default async function handler(_req, res) {
  try {
    const registryPath = path.join(REPO_ROOT, "widget-modules", "contracts.json");
    const registry = fs.existsSync(registryPath)
      ? JSON.parse(fs.readFileSync(registryPath, "utf8"))
      : { contracts: [], contractCount: 0 };

    const widgetsDir = path.join(REPO_ROOT, "dist", "widgets");
    let widgetsBuilt = 0;
    try {
      widgetsBuilt = fs.readdirSync(widgetsDir).filter((f) => f.endsWith(".widget.js")).length;
    } catch {}

    res.status(200).json({
      contractCount: registry.contractCount || registry.contracts?.length || 0,
      widgetsBuilt,
      modules: listModules().length,
      abiEntries: (registry.contracts || []).reduce(
        (sum, c) => sum + (c.functions?.length || 0) + (c.events?.length || 0),
        0
      )
    });
  } catch (e) {
    res.status(200).json({
      contractCount: 0, widgetsBuilt: 0, modules: listModules().length, abiEntries: 0
    });
  }
}
