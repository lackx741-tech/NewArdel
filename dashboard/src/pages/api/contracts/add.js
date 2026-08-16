/**
 * POST /api/contracts/add
 * Add a new smart contract to the registry.
 *
 * Accepts:
 *   - multipart/form-data with a `file` field (.sol file)
 *   - application/json with { name, source } where source is Solidity text
 *
 * Writes the file under contracts/, compiles via Hardhat, regenerates ABIs,
 * and returns the discovery result (which contracts were found) plus any
 * compile errors. Does NOT deploy — this is ABI/library management only.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);
const REPO_ROOT = path.resolve(process.cwd(), "..");
const CONTRACTS_DIR = path.join(REPO_ROOT, "contracts");

// Disable Next.js body parsing for multipart. We read the raw body manually
// so we can parse multipart/form-data without an extra dependency.
export const config = { api: { bodyParser: false } };

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
  // Keep it safe: alnum, dash, underscore, single .sol extension.
  let n = name.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!n.endsWith(".sol")) n += ".sol";
  // Prevent path traversal.
  n = n.replace(/\.\.+/g, "").replace(/^\/+/, "");
  return n;
}

function safeWrite(filename, content) {
  const safe = sanitizeFilename(filename);
  // Ensure the contracts dir exists (Hardhat normally has it).
  fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  const target = path.join(CONTRACTS_DIR, safe);
  // Final guard: target must resolve under CONTRACTS_DIR.
  if (!target.startsWith(path.resolve(CONTRACTS_DIR))) {
    throw new Error("Invalid file path");
  }
  fs.writeFileSync(target, content);
  return { safe, target };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let filename, source;

    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const buf = Buffer.concat(chunks);
      const boundary = (contentType.match(/boundary=(.+)/) || [])[1];
      if (!boundary) return res.status(400).json({ error: "No multipart boundary" });
      const parts = parseMultipart(buf, boundary);
      const file = parts.file || parts["files[]"];
      if (!file || !file.content) {
        // Maybe the source was sent as a text field + name field.
        if (parts.name && parts.source) {
          filename = parts.name;
          source = parts.source;
        } else {
          return res.status(400).json({ error: "No .sol file or source provided" });
        }
      } else {
        filename = file.filename;
        source = file.content.toString("utf8");
      }
    } else {
      // JSON body
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      filename = body.name;
      source = body.source;
    }

    if (!filename || !source) {
      return res.status(400).json({ error: "Both 'name' and 'source' are required" });
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

    const { stdout: genOut } = await execAsync("node widget-modules/generate-abis.js", {
      cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024, timeout: 30000
    }).catch((e) => { throw new Error("ABI regeneration failed: " + (e.stderr || e.message)); });

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
    res.status(500).json({ error: e.message });
  }
}
