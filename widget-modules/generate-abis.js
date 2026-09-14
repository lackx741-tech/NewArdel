/**
 * Auto-discovers every compiled contract under contracts/ and emits abis.js +
 * contracts.json so the widget runtime and dashboard always reflect the full
 * contract set — no hardcoded lists.
 *
 * To add a smart contract:
 *   1. Drop your .sol into contracts/ (any subdir, e.g. contracts/Facets/)
 *   2. npx hardhat compile
 *   3. node widget-modules/generate-abis.js
 *   4. The contract's ABI + metadata is now available in the dashboard and widget.
 *
 * Run: npx hardhat compile && node widget-modules/generate-abis.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.join(ROOT, "artifacts", "contracts");
const ABI_IMPORTS_PATH = path.join(__dirname, "abi-imports.json");

/**
 * Walk the artifacts/contracts tree and yield every *.json (excluding .dbg).
 * Each artifact maps back to a contract name + source path.
 */
function discoverArtifacts() {
  const found = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.name.endsWith(".json") &&
        !entry.name.endsWith(".dbg.json")
      ) {
        const rel = path.relative(ARTIFACTS, full); // e.g. Facets/Foo.sol/Foo.json
        // contract name = basename without .json; source = the .sol dir part
        const contractName = entry.name.slice(0, -5);
        const sourceRel = path.dirname(rel); // Facets/Foo.sol
        found.push({ contractName, sourceRel, artifactPath: full });
      }
    }
  }

  walk(ARTIFACTS);
  return found;
}

/**
 * Load an artifact and derive metadata: ABI, whether it's an interface,
 * whether it's a deployable contract (has bytecode), and a source hint.
 */
function loadArtifact({ contractName, sourceRel, artifactPath }) {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const abi = artifact.abi || [];
  const isInterface = sourceRel.endsWith("/interfaces/") || sourceRel.startsWith("interfaces/");
  const hasBytecode =
    typeof artifact.bytecode === "string" &&
    artifact.bytecode.length > 2 &&
    artifact.bytecode !== "0x";
  return {
    name: contractName,
    source: sourceRel, // e.g. "SessionDelegate.sol" or "interfaces/IEIP7702.sol"
    isInterface,
    isDeployable: hasBytecode,
    abi
  };
}

/**
 * Load ABI-only imports registered through the dashboard. These imports are a
 * durable source of truth so they survive later Hardhat recompiles.
 */
function loadAbiImports() {
  if (!fs.existsSync(ABI_IMPORTS_PATH)) return [];

  const parsed = JSON.parse(fs.readFileSync(ABI_IMPORTS_PATH, "utf8"));
  const imports = Array.isArray(parsed) ? parsed : parsed.contracts;
  if (!Array.isArray(imports)) {
    throw new Error("widget-modules/abi-imports.json must contain a contracts array");
  }

  return imports.map((entry) => {
    if (!entry || typeof entry.name !== "string" || !Array.isArray(entry.abi)) {
      throw new Error("Each ABI import must include a name and non-empty abi array");
    }
    return {
      name: entry.name,
      source: entry.source || `external/${entry.name}.sol`,
      isInterface: Boolean(entry.isInterface),
      isDeployable: entry.isDeployable !== false,
      abi: entry.abi,
      imported: true
    };
  });
}

/**
 * Generate the contract registry: name -> { name, source, isInterface,
 * isDeployable, functions[], events[], errors[] }.
 * Used by the dashboard to list contracts and by the widget to know what's
 * callable without shipping the full ABI blob.
 */
function summarize(meta) {
  const pick = (type) =>
    meta.abi
      .filter((e) => e.type === type)
      .map((e) => ({
        name: e.name,
        inputs: (e.inputs || []).map((i) => ({ name: i.name, type: i.type })),
        outputs: (e.outputs || []).map((i) => ({ name: i.name, type: i.type })),
        stateMutability: e.stateMutability
      }));
  return {
    name: meta.name,
    source: meta.source,
    isInterface: meta.isInterface,
    isDeployable: meta.isDeployable,
    functions: pick("function"),
    events: meta.abi
      .filter((e) => e.type === "event")
      .map((e) => ({
        name: e.name,
        inputs: (e.inputs || []).map((i) => ({ name: i.name, type: i.type, indexed: i.indexed }))
      })),
    errors: meta.abi
      .filter((e) => e.type === "error")
      .map((e) => ({
        name: e.name,
        inputs: (e.inputs || []).map((i) => ({ name: i.name, type: i.type }))
      }))
  };
}

function generate() {
  const artifacts = discoverArtifacts();
  if (artifacts.length === 0) {
    throw new Error(
      `No artifacts found in ${ARTIFACTS}. Run \`npx hardhat compile\` first.`
    );
  }

  const metasByName = new Map();
  for (const meta of artifacts.map(loadArtifact)) {
    metasByName.set(meta.name, meta);
  }
  for (const meta of loadAbiImports()) {
    if (metasByName.has(meta.name)) {
      throw new Error(`ABI import "${meta.name}" conflicts with a compiled contract name`);
    }
    metasByName.set(meta.name, meta);
  }
  const metas = Array.from(metasByName.values());

  // ABIS module (full ABIs for the widget runtime).
  const abisMap = {};
  for (const m of metas) abisMap[m.name] = m.abi;

  const abisHeader = `/**
 * AUTO-GENERATED from Hardhat artifacts. Do not edit by hand.
 * Regenerate with: node widget-modules/generate-abis.js
 *
 * Full ABIs for EVERY contract under contracts/ plus dashboard ABI imports.
 * To add a Solidity contract: drop the .sol in contracts/, compile, regenerate.
 * To add an external deployed contract: import its ABI from the dashboard.
 */
`;
  const abisBody = `export const ABIS = ${JSON.stringify(abisMap, null, 2)};\n\nexport default ABIS;\n`;
  const abisPath = path.join(__dirname, "abis.js");
  fs.writeFileSync(abisPath, abisHeader + abisBody);

  // Contracts registry (metadata + summaries, no full ABI blob).
  const registry = {
    generatedAt: new Date().toISOString(),
    contractCount: metas.length,
    contracts: metas.map(summarize)
  };
  const registryPath = path.join(__dirname, "contracts.json");
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));

  // Also emit a JS version for the dashboard to import.
  const registryJsPath = path.join(__dirname, "contracts.registry.js");
  fs.writeFileSync(
    registryJsPath,
    `/** AUTO-GENERATED. Regenerate with: node widget-modules/generate-abis.js */\n` +
      `export const CONTRACT_REGISTRY = ${JSON.stringify(registry, null, 2)};\n` +
      `export default CONTRACT_REGISTRY;\n`
  );

  console.log("✓ Discovered", metas.length, "contracts");
  for (const m of metas) {
    console.log(
      `  ${m.isInterface ? "iface " : m.isDeployable ? "deploy" : "      "}  ${m.name.padEnd(20)} (${m.abi.length} ABI entries)  ${m.source}`
    );
  }
  console.log("\n✓ Wrote:");
  console.log("  " + path.relative(ROOT, abisPath));
  console.log("  " + path.relative(ROOT, registryPath));
  console.log("  " + path.relative(ROOT, registryJsPath));
}

generate();
