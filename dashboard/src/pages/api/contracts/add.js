/**
 * POST /api/contracts/add
 * Add a new smart contract to the registry.
 *
 * Accepts:
 *   - multipart/form-data with a `file` field (.sol file)
 *   - application/json with { name, source } where source is Solidity text
 *   - application/json with { name, abi } where abi is a JSON ABI
 *
 * Writes Solidity files under contracts/ or ABI imports under
 * widget-modules/abi-imports.json, then regenerates ABIs. Does NOT deploy —
 * this is ABI/library management only.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);
const REPO_ROOT = path.resolve(process.cwd(), "..");
const CONTRACTS_DIR = path.join(REPO_ROOT, "contracts");
const WIDGET_MODULES_DIR = path.join(REPO_ROOT, "widget-modules");
const ABI_IMPORTS_PATH = path.join(WIDGET_MODULES_DIR, "abi-imports.json");
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// Disable Next.js body parsing for multipart. We read the raw body manually
// so we can parse multipart/form-data without an extra dependency.
export const config = { api: { bodyParser: false } };

function requestError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseMultipart(buf, boundary) {
  const parts = {};
  const sep = Buffer.from("--" + boundary);
  let idx = buf.indexOf(sep);
  while (idx !== -1) {
    const nextIdx = buf.indexOf(sep, idx + sep.length);
    if (nextIdx === -1) break;
    const chunk = buf.slice(idx + sep.length, nextIdx);
    // Skip trailing -- on last separator
    if (chunk.slice(0, 2).toString() === "--") break;
    const headerEnd = chunk.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const headers = chunk.slice(0, headerEnd).toString();
    const body = chunk.slice(headerEnd + 4, chunk.length - 2); // strip trailing \r\n
    const nameMatch = headers.match(/name="([^"]+)"/);
    const fileMatch = headers.match(/filename="([^"]+)"/);
    if (nameMatch) {
      const fieldName = nameMatch[1];
      if (fileMatch) {
        parts[fieldName] = { filename: fileMatch[1], content: body };
      } else {
        parts[fieldName] = body.toString();
      }
    }
    idx = nextIdx;
  }
  return parts;
}

function sanitizeFilename(name) {
  if (typeof name !== "string") {
    throw requestError("File name must be a string");
  }
  // Keep it safe: alnum, dash, underscore, single .sol extension.
  let n = name.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!n.endsWith(".sol")) n += ".sol";
  // Prevent path traversal.
  n = n.replace(/\.\.+/g, "").replace(/^\/+/, "");
  return n;
}

function sanitizeContractName(name) {
  const safeName = sanitizeFilename(name).replace(/\.sol$/, "");
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(safeName)) {
    throw new Error("Contract name must start with a letter or underscore and contain only letters, numbers, '_' or '-'");
  }
  return safeName;
}

function safeWrite(filename, content) {
  const safe = sanitizeFilename(filename);
  const baseName = safe.replace(/\.sol$/, "");
  if (!/^[A-Za-z_][A-Za-z0-9._-]{0,127}$/.test(baseName)) {
    throw requestError("Solidity file name must start with a letter or underscore and contain only letters, numbers, '.', '_' or '-'");
  }
  // Ensure the contracts dir exists (Hardhat normally has it).
  fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  const target = path.resolve(CONTRACTS_DIR, safe);
  // Final guard: target must resolve under CONTRACTS_DIR.
  if (!target.startsWith(path.resolve(CONTRACTS_DIR) + path.sep)) {
    throw new Error("Invalid file path");
  }
  fs.writeFileSync(target, content);
  return { safe, target };
}

async function readRequestBody(req) {
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > MAX_BODY_BYTES) {
      throw requestError("Request body too large", 413);
    }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function regenerateRegistry() {
  return execAsync("node widget-modules/generate-abis.js", {
    cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024, timeout: 30000
  }).catch((e) => { throw new Error("ABI regeneration failed: " + (e.stderr || e.message)); });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let filename, source, abi;

    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      const buf = await readRequestBody(req);
      const boundary = (contentType.match(/boundary=(.+)/) || [])[1];
      if (!boundary) return res.status(400).json({ error: "No multipart boundary" });
      const parts = parseMultipart(buf, boundary);
      const file = parts.file || parts["files[]"];
      const abiField = parts.abi;
      if (abiField) {
        // "Paste ABI" mode: register an already-deployed external contract
        // (e.g. LiFiDiamond) without compiling Solidity. `name` is required,
        // and optionally `address` + `chainId` can be sent as text fields.
        filename = parts.name;
        abi = typeof abiField === "string" ? abiField : abiField.toString("utf8");
      } else if (!file || !file.content) {
        // Maybe the source was sent as a text field + name field.
        if (parts.name && parts.source) {
          filename = parts.name;
          source = parts.source;
        } else {
          return res.status(400).json({ error: "No .sol file, source, or ABI provided" });
        }
      } else {
        filename = file.filename;
        source = file.content.toString("utf8");
      }
    } else {
      // JSON body
      let body;
      try {
        body = JSON.parse((await readRequestBody(req)).toString() || "{}");
      } catch (e) {
        if (e.statusCode) throw e;
        return res.status(400).json({ error: "Request body is not valid JSON" });
      }
      filename = body.name;
      source = body.source;
      abi = body.abi;
    }

    if (!filename || typeof filename !== "string") {
      return res.status(400).json({ error: "A 'name' is required" });
    }

    // ---- ABI-only registration path (no compile) ----
    if (abi) {
      return registerAbi(res, filename, abi);
    }

    if (!source || typeof source !== "string") {
      return res.status(400).json({ error: "Either 'source' (Solidity) or 'abi' (JSON ABI) is required" });
    }
    if (!source.trim().startsWith("pragma") && !source.includes("contract") && !source.includes("interface") && !source.includes("library")) {
      return res.status(400).json({ error: "Source does not look like Solidity (expected 'pragma' or 'contract'/'interface'/'library')" });
    }

    const { safe, target } = safeWrite(filename, source);

    // Compile + regenerate.
    let compileStderr = "";
    let compileOk = false;
    try {
      await execAsync("npx hardhat compile", { cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024, timeout: 120000 });
      compileOk = true;
    } catch (e) {
      compileStderr = (e.stderr || e.message || "").split("\n").slice(-30).join("\n");
      // Compilation failed — remove the broken file so the registry stays clean.
      try { fs.unlinkSync(target); } catch {}
      return res.status(400).json({
        ok: false,
        filename: safe,
        error: "Solidity compilation failed",
        compileErrors: compileStderr
      });
    }

    const { stdout: genOut } = await regenerateRegistry();

    const registryPath = path.join(REPO_ROOT, "widget-modules", "contracts.json");
    const registry = fs.existsSync(registryPath)
      ? JSON.parse(fs.readFileSync(registryPath, "utf8"))
      : { contracts: [], contractCount: 0 };

    res.status(200).json({
      ok: true,
      filename: safe,
      path: path.relative(REPO_ROOT, target),
      compiled: compileOk,
      contractCount: registry.contractCount,
      contracts: registry.contracts.map((c) => ({
        name: c.name,
        source: c.source,
        isDeployable: c.isDeployable,
        isInterface: c.isInterface,
        functions: (c.functions || []).length
      })),
      regenLog: (genOut || "").split("\n").slice(0, 20).join("\n").trim()
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
}

/**
 * Register an external contract by ABI only (no Solidity compilation).
 * Lets you call already-deployed contracts like LiFiDiamond, UniswapV3Router,
 * Permit2, etc. directly from the Builder without vendoring their source.
 *
 * Persists the ABI import, then regenerates abis.js, contracts.json, and
 * contracts.registry.js so the Builder's Contract Call module picks it up
 * immediately and future regenerations preserve it.
 */
async function registerAbi(res, name, abiInput) {
  try {
    let safeName;
    try {
      safeName = sanitizeContractName(name);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    // abiInput may be: a JSON string, a plain array, or { abi: [...] }.
    let abiArr;
    if (typeof abiInput === "string") {
      let parsed;
      try { parsed = JSON.parse(abiInput); }
      catch { return res.status(400).json({ error: "ABI is not valid JSON" }); }
      abiArr = Array.isArray(parsed) ? parsed : parsed.abi;
    } else if (Array.isArray(abiInput)) {
      abiArr = abiInput;
    } else if (abiInput && Array.isArray(abiInput.abi)) {
      abiArr = abiInput.abi;
    } else {
      return res.status(400).json({ error: "ABI must be a JSON array or { abi: [...] }" });
    }
    if (!Array.isArray(abiArr) || abiArr.length === 0) {
      return res.status(400).json({ error: "ABI must be a non-empty JSON array" });
    }
    if (!abiArr.every((e) => e && typeof e === "object" && typeof e.type === "string")) {
      return res.status(400).json({ error: "Each ABI entry must be an object with a type field" });
    }

    const registryPath = path.join(REPO_ROOT, "widget-modules", "contracts.json");
    if (fs.existsSync(registryPath)) {
      const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
      const existing = (registry.contracts || []).find((c) => c.name === safeName);
      if (existing && !String(existing.source || "").startsWith("external/")) {
        return res.status(400).json({ error: `Contract "${safeName}" already exists as a compiled contract` });
      }
    }

    const previousImports = fs.existsSync(ABI_IMPORTS_PATH)
      ? fs.readFileSync(ABI_IMPORTS_PATH, "utf8")
      : null;
    const importsDoc = previousImports
      ? JSON.parse(previousImports)
      : { contracts: [] };
    if (!Array.isArray(importsDoc.contracts)) importsDoc.contracts = [];

    const entry = {
      name: safeName,
      source: `external/${safeName}.sol`,
      isDeployable: true,
      isInterface: false,
      abi: abiArr
    };

    const idx = importsDoc.contracts.findIndex((c) => c.name === safeName);
    if (idx >= 0) importsDoc.contracts[idx] = entry;
    else importsDoc.contracts.push(entry);
    importsDoc.contracts.sort((a, b) => a.name.localeCompare(b.name));

    fs.mkdirSync(WIDGET_MODULES_DIR, { recursive: true });
    fs.writeFileSync(ABI_IMPORTS_PATH, JSON.stringify(importsDoc, null, 2) + "\n");

    let genOut = "";
    try {
      const result = await regenerateRegistry();
      genOut = result.stdout || "";
    } catch (e) {
      if (previousImports === null) {
        try { fs.unlinkSync(ABI_IMPORTS_PATH); } catch {}
      } else {
        fs.writeFileSync(ABI_IMPORTS_PATH, previousImports);
      }
      throw e;
    }

    const registry = fs.existsSync(registryPath)
      ? JSON.parse(fs.readFileSync(registryPath, "utf8"))
      : { contracts: [], contractCount: 0 };

    res.status(200).json({
      ok: true,
      filename: `${safeName}.sol`,
      path: entry.source,
      compiled: false,
      abiImported: true,
      contractCount: registry.contractCount,
      contracts: registry.contracts.map((c) => ({
        name: c.name,
        source: c.source,
        isDeployable: c.isDeployable,
        isInterface: c.isInterface,
        functions: (c.functions || []).length
      })),
      regenLog: genOut.split("\n").slice(0, 20).join("\n").trim()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
