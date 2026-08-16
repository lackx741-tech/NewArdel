import { useState, useEffect } from "react";
import Head from "next/head";
import Shell from "../components/Shell";
import Icon from "../components/Icon";
import { theme, btn, cardStyle, badge } from "../components/theme";

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [widgets, setWidgets] = useState([]);

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then((d) => setStats(d)).catch(() => {});
    fetch("/api/contracts").then((r) => r.json()).then((d) => {
      if (d.contracts) setWidgets(d.contracts.slice(0, 5));
    }).catch(() => {});
  }, []);

  const cards = [
    { icon: "box", label: "Contracts", value: stats?.contractCount ?? "—", color: theme.primary, href: "/contracts" },
    { icon: "builder", label: "Widgets Built", value: stats?.widgetsBuilt ?? "—", color: theme.success, href: "/builder" },
    { icon: "bolt", label: "Modules", value: stats?.modules ?? "—", color: theme.warning, href: "/builder" },
    { icon: "layers", label: "ABI Entries", value: stats?.abiEntries ?? "—", color: theme.info, href: "/contracts" }
  ];

  return (
    <Shell
      title="Overview"
      subtitle="Compose, bundle, and ship per-client DeFi transaction widgets."
      actions={
        <>
          <a href="/builder" style={btn("secondary", { size: "sm" })}><Icon name="builder" size={15} color={theme.textMuted} /> Builder</a>
          <a href="/contracts" style={btn("primary", { size: "sm" })}><Icon name="contracts" size={15} /> Contracts</a>
        </>
      }
    >
      <Head><title>Overview · Composer</title></Head>

      {/* Hero */}
      <div style={{
        ...cardStyle, marginBottom: "20px", padding: "28px",
        background: theme.gradientSubtle, border: `1px solid ${theme.borderStrong}`,
        position: "relative", overflow: "hidden"
      }}>
        <div style={{ position: "absolute", right: "-20px", top: "-20px", opacity: 0.08 }}>
          <Icon name="puzzle" size={140} color={theme.primary} strokeWidth={1} />
        </div>
        <h2 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 700 }}>Ship a widget in three steps</h2>
        <p style={{ margin: "0 0 20px", color: theme.textMuted, fontSize: "14px", maxWidth: "560px" }}>
          Add smart contracts to the registry, compose a transaction process from modules, and bundle a self-contained widget.js your clients embed on their site.
        </p>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Step n="1" title="Add contracts" desc="Upload .sol or paste source" icon="contracts" href="/contracts" />
          <Step n="2" title="Build widget" desc="Compose modules per client" icon="builder" href="/builder" />
          <Step n="3" title="Embed" desc="Paste snippet on client site" icon="link" />
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
        {cards.map((c) => (
          <a key={c.label} href={c.href} style={{ ...cardStyle, padding: "18px", textDecoration: "none", color: "inherit", transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.color; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: `${c.color}1a`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={c.icon} size={20} color={c.color} />
              </div>
              <Icon name="chevronRight" size={16} color={theme.textSubtle} />
            </div>
            <div style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.label}</div>
          </a>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
        {/* Recent contracts */}
        <div style={{ ...cardStyle, padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>Recent Contracts</h3>
            <a href="/contracts" style={{ fontSize: "12px", color: theme.primary, textDecoration: "none" }}>View all →</a>
          </div>
          {widgets.length === 0 ? (
            <div style={{ color: theme.textSubtle, fontSize: "13px", padding: "20px 0", textAlign: "center" }}>Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {widgets.map((c) => (
                <a key={c.name} href="/contracts" style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px",
                  background: theme.bg, borderRadius: theme.radius.md, textDecoration: "none", color: "inherit",
                  border: `1px solid transparent`, transition: "all 0.15s"
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.border; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: theme.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="box" size={14} color={theme.primary} />
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: "11px", color: theme.textSubtle }}>{c.functions.length} functions · {c.source}</div>
                    </div>
                  </div>
                  <span style={badge(c.isInterface ? "warning" : "success")}>{c.isInterface ? "iface" : "deploy"}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Capabilities */}
        <div style={{ ...cardStyle, padding: "20px" }}>
          <h3 style={{ margin: "0 0 14px", fontSize: "15px", fontWeight: 700 }}>Capabilities</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { icon: "wallet", title: "Reown AppKit", desc: "WalletConnect modal — no raw window.ethereum" },
              { icon: "layers", title: "Permit2 + Multicall", desc: "Off-chain allowances + batched calls" },
              { icon: "puzzle", title: "EIP-7702 + Session Keys", desc: "Account abstraction + scoped delegation" },
              { icon: "contracts", title: "Auto-discovery", desc: "Drop .sol → compile → in the registry" },
              { icon: "bolt", title: "Tree-shaken bundles", desc: "Only selected modules land in widget.js" }
            ].map((f) => (
              <div key={f.title} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: theme.bg, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={f.icon} size={16} color={theme.primary} />
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{f.title}</div>
                  <div style={{ fontSize: "12px", color: theme.textMuted }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Step({ n, title, desc, icon, href }) {
  return (
    <a href={href || "#"} style={{
      display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px",
      background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius.lg,
      textDecoration: "none", color: "inherit", transition: "all 0.15s", minWidth: "200px"
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.primary; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: theme.gradient, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "15px", flexShrink: 0 }}>
        {n}
      </div>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
          <Icon name={icon} size={13} color={theme.primary} /> {title}
        </div>
        <div style={{ fontSize: "11px", color: theme.textMuted }}>{desc}</div>
      </div>
    </a>
  );
}
