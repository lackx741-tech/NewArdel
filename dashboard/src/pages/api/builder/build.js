import { buildWidget } from "../../../bundler";

// CDN URLs for the externalized deps (ethers + Reown AppKit).
// The host page loads these once via an import map; the widget.js imports them
// by bare specifier. Versions kept in sync with the dashboard package.json.
const DEP_URLS = {
  ethers: "https://esm.sh/ethers@6.13.4",
  "@reown/appkit": "https://esm.sh/@reown/appkit@1.5.0",
  "@reown/appkit/networks": "https://esm.sh/@reown/appkit@1.5.0/networks",
  "@reown/appkit-adapter-ethers": "https://esm.sh/@reown/appkit-adapter-ethers@1.5.0"
};

function importMap() {
  return JSON.stringify({
    imports: DEP_URLS
  });
}

function embedSnippet(widgetUrl, origin) {
  const full = `${origin || ""}${widgetUrl}`;
  return `<script type="importmap">\n${JSON.stringify({ imports: DEP_URLS }, null, 2)}\n</script>\n<script type="module" src="${full}"></script>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const client = req.body;
  if (!client || !client.id || !Array.isArray(client.process)) {
    return res.status(400).json({ error: "Invalid client config" });
  }

  try {
    const result = await buildWidget(client);
    const widgetUrl = `/api/widgets/${client.id}.widget.js`;
    const origin = `https://${req.headers.host}`;
    res.status(200).json({
      ok: true,
      modules: result.modules,
      size: result.size,
      filename: `${client.id}.widget.js`,
      url: widgetUrl,
      format: "esm",
      externals: Object.keys(DEP_URLS),
      importMap: importMap(),
      embed: embedSnippet(widgetUrl, origin)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
