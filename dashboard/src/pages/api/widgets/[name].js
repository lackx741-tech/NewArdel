import fs from "fs";
import path from "path";

// Match the bundler: widgets are written to <repo-root>/dist/widgets.
// Resolve repo root robustly (cwd may be dashboard/ or repo root).
function findRepoRoot() {
  const c1 = path.resolve(process.cwd(), "..");
  const c2 = process.cwd();
  if (fs.existsSync(path.join(c1, "widget-modules"))) return c1;
  if (fs.existsSync(path.join(c2, "widget-modules"))) return c2;
  return c1;
}
const REPO_ROOT = findRepoRoot();
const widgetsDir = path.join(REPO_ROOT, "dist/widgets");

export default function handler(req, res) {
  const { name } = req.query;
  if (!name || typeof name !== "string" || !name.endsWith(".widget.js")) {
    return res.status(400).json({ error: "Invalid widget filename" });
  }
  const file = path.join(widgetsDir, name);
  // Prevent path traversal.
  if (!file.startsWith(widgetsDir + path.sep)) {
    return res.status(400).json({ error: "Invalid path" });
  }
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "Widget not found. Build it first." });
  }
  res.setHeader("Content-Type", "text/javascript");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200).send(fs.readFileSync(file, "utf8"));
}
