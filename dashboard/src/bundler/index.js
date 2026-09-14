/**
 * Bundler: takes a ClientConfig and emits a single self-contained widget.js.
 *
 * It generates an entry that imports only the selected runtime modules
 * (tree-shaken by esbuild), bakes in the client config, and produces an ESM
 * bundle the host page loads via <script type="module" src="…/widget.js"></script>.
 */

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const { resolveDependencies, getModule } = require("../composer/modules");

/**
 * Resolve the repo root robustly across run contexts:
 *  - Next server (dev/start): process.cwd() = dashboard/, __dirname in .next/server
 *  - Direct run from dashboard/: process.cwd() = dashboard/
 *  - Direct run from repo root: process.cwd() = NewArdel/
 * widget-modules/ is a sibling of dashboard/, so we probe candidate parents.
 */
function findRepoRoot() {
  const candidates = [
    path.resolve(process.cwd(), ".."), // cwd = dashboard/
    process.cwd(),                      // cwd = repo root
    path.resolve(__dirname, "../../..") // this file at dashboard/src/bundler
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "widget-modules", "widget.template.js"))) {
      return c;
    }
  }
  // Fallback to the first candidate; a clearer error surfaces later.
  return path.resolve(process.cwd(), "..");
}

const REPO_ROOT = findRepoRoot();
const MODULES_ROOT = path.join(REPO_ROOT, "widget-modules");
const TEMPLATE_PATH = path.join(MODULES_ROOT, "widget.template.js");
const RUNTIME_PATH = path.join(MODULES_ROOT, "runtime.js");
const SAFE_CLIENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SAFE_REOWN_PROJECT_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

// Map composer module id -> { namedImport } from runtime.js
const RUNTIME_EXPORTS = {
  permit2: "permit2Sign",
  eip712: "eip712Sign",
  multicall: "multicall",
  sessionKey: "grantSessionKey",
  eip7702: "setEip7702Delegate",
  contractCall: "contractCall"
};

function validateClientConfig(clientConfig) {
  if (!clientConfig || typeof clientConfig !== "object") {
    return { ok: false, error: "Client config must be an object" };
  }
  if (typeof clientConfig.id !== "string" || !SAFE_CLIENT_ID_RE.test(clientConfig.id)) {
    return {
      ok: false,
      error: "Client id must be 1-64 characters using only letters, numbers, '_' or '-'"
    };
  }
  if (typeof clientConfig.name !== "string" || clientConfig.name.trim().length === 0) {
    return { ok: false, error: "Client name is required" };
  }
  if (!/^\d+$/.test(String(clientConfig.chainId || ""))) {
    return { ok: false, error: "chainId must be a numeric string" };
  }
  if (
    typeof clientConfig.reownProjectId !== "string" ||
    !SAFE_REOWN_PROJECT_ID_RE.test(clientConfig.reownProjectId.trim())
  ) {
    return {
      ok: false,
      error: "A valid Reown project id is required before building a production widget"
    };
  }
  if (!Array.isArray(clientConfig.process)) {
    return { ok: false, error: "Client process must be an array" };
  }
  for (const step of clientConfig.process) {
    if (!step || typeof step.moduleId !== "string" || !getModule(step.moduleId)) {
      return { ok: false, error: `Unknown module: ${step?.moduleId || ""}` };
    }
  }
  return { ok: true };
}

function assertValidClientConfig(clientConfig) {
  const validation = validateClientConfig(clientConfig);
  if (!validation.ok) throw new Error(validation.error);
}

/**
 * Build a widget.js for a client config.
 * @param {import("../composer/types").ClientConfig} clientConfig
 * @param {{ outDir?: string }} [opts]
 * @returns {Promise<{ outPath: string, size: number, modules: string[] }>}
 */
async function buildWidget(clientConfig, opts = {}) {
  assertValidClientConfig(clientConfig);

  const outDir = opts.outDir || path.join(REPO_ROOT, "dist/widgets");
  const resolvedOutDir = path.resolve(outDir);
  fs.mkdirSync(resolvedOutDir, { recursive: true });

  // Determine which modules to include (with transitive deps).
  const processModuleIds = (clientConfig.process || []).map((s) => s.moduleId);
  const included = resolveDependencies(processModuleIds);

  // Generate the entry file: import the selected runtime fns (ethers is already
  // imported by the template), wire them into the MODULES map, and re-export.
  const imports = [];
  const named = [];
  for (const id of included) {
    const exp = RUNTIME_EXPORTS[id];
    if (!exp) throw new Error(`No runtime export for module "${id}"`);
    imports.push(`import { ${exp} as _mod_${id} } from ${JSON.stringify("./runtime.js")};`);
    named.push(`"${id}": _mod_${id}`);
  }

  // Read the template and inject placeholders. esbuild resolves "./runtime.js"
  // relative to the entry, so we write the entry next to a copy of runtime.
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  // Replace the placeholder MODULES map with the real one.
  let entry = template
    .replace("// __MODULE_IMPORTS__", imports.join("\n"))
    .replace("  // __MODULE_MAP__", `  ${named.join(",\n  ")}`)
    .replace("/** @type {any} */ (__CLIENT_CONFIG__)", JSON.stringify(clientConfig));

  // Write the entry to a temp dir alongside runtime.js + abis.js + wallet.js
  // so esbuild resolves the relative imports.
  const tmpDir = path.join(REPO_ROOT, ".bundle-tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "runtime.js"), fs.readFileSync(RUNTIME_PATH));
  fs.writeFileSync(path.join(tmpDir, "abis.js"), fs.readFileSync(path.join(MODULES_ROOT, "abis.js")));
  fs.writeFileSync(path.join(tmpDir, "wallet.js"), fs.readFileSync(path.join(MODULES_ROOT, "wallet.js")));
  const entryPath = path.join(tmpDir, "entry.js");
  fs.writeFileSync(entryPath, entry);

  const outFile = `${clientConfig.id}.widget.js`;
  const outPath = path.resolve(resolvedOutDir, outFile);
  if (!outPath.startsWith(resolvedOutDir + path.sep)) {
    throw new Error("Invalid widget output path");
  }

  // Reown AppKit + ethers are heavy, browser-only, and ship their own CSS/DOM.
  // Mark them external and load from a CDN import map on the host page so the
  // widget.js stays small and the host loads these deps once. The embed
  // snippet (returned by the build API) includes the import map.
  const externals = [
    "@reown/appkit",
    "@reown/appkit/networks",
    "@reown/appkit-adapter-ethers",
    "ethers"
  ];

  await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    minify: true,
    format: "esm",
    globalName: "ComposerWidget",
    outfile: outPath,
    target: ["es2020"],
    legalComments: "none",
    logLevel: "warning",
    external: externals
  });

  const size = fs.statSync(outPath).size;

  // Clean up tmp.
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return { outPath, size, modules: included };
}

module.exports = { buildWidget, validateClientConfig };
