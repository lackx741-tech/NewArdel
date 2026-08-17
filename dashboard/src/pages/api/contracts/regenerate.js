/**
 * POST /api/contracts/regenerate
 * Compiles contracts and regenerates the ABI/registry files.
 *
 * Runs: npx hardhat compile && node widget-modules/generate-abis.js
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);
const REPO_ROOT = path.resolve(process.cwd(), "..");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Compile contracts.
    const { stdout: compileOut } = await execAsync("npx hardhat compile", {
      cwd: REPO_ROOT,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000
    });

    // 2. Regenerate ABIs + registry.
    const { stdout: genOut } = await execAsync("node widget-modules/generate-abis.js", {
      cwd: REPO_ROOT,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000
    });

    // 3. Read back the new registry to report counts.
    const registryPath = path.join(REPO_ROOT, "widget-modules", "contracts.json");
    const registry = fs.existsSync(registryPath)
      ? JSON.parse(fs.readFileSync(registryPath, "utf8"))
      : { contracts: [], contractCount: 0 };

    res.status(200).json({
      ok: true,
      contractCount: registry.contractCount,
      contracts: registry.contracts.map((c) => ({ name: c.name, source: c.source, isDeployable: c.isDeployable })),
      compileLog: (compileOut || "").split("\n").slice(-5).join("\n").trim(),
      regenLog: (genOut || "").split("\n").slice(0, 20).join("\n").trim()
    });
  } catch (e) {
    res.status(500).json({
      error: e.message,
      stderr: e.stderr ? e.stderr.split("\n").slice(-20).join("\n") : undefined
    });
  }
}
