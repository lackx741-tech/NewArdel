import { useState } from "react";
import Icon from "./Icon";
import { theme } from "./theme";

const NAV = [
  { href: "/", label: "Overview", icon: "dashboard" },
  { href: "/builder", label: "Widget Builder", icon: "builder" },
  { href: "/contracts", label: "Contracts", icon: "contracts" }
];

export default function Shell({ children, title, subtitle, actions }) {
  const [collapsed, setCollapsed] = useState(false);
  const active = typeof window !== "undefined" ? window.location.pathname : "/";

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: theme.font.sans, background: theme.bg, color: theme.text }}>
      {/* Sidebar */}
      <aside
        style={{
          width: collapsed ? "64px" : "240px",
          background: theme.bgElevated,
          borderRight: `1px solid ${theme.border}`,
          display: "flex",
          flexDirection: "column",
          transition: "width 0.2s ease",
          position: "sticky",
          top: 0,
          height: "100vh",
          flexShrink: 0
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "18px 16px",
            borderBottom: `1px solid ${theme.border}`,
            cursor: "pointer",
            userSelect: "none"
          }}
          onClick={() => setCollapsed((c) => !c)}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: theme.gradient,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: theme.shadow.glow
            }}
          >
            <Icon name="bolt" size={18} color="#fff" strokeWidth={2} />
          </div>
          {!collapsed && (
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap" }}>Composer</div>
              <div style={{ fontSize: "10px", color: theme.textSubtle, whiteSpace: "nowrap" }}>Widget Studio</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {NAV.map((item) => {
            const isActive = active === item.href || (item.href !== "/" && active.startsWith(item.href));
            return (
              <a
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: theme.radius.md,
                  color: isActive ? theme.text : theme.textMuted,
                  background: isActive ? theme.surfaceActive : "transparent",
                  textDecoration: "none",
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 500,
                  border: isActive ? `1px solid ${theme.borderStrong}` : "1px solid transparent",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap"
                }}
              >
                <Icon name={item.icon} size={18} color={isActive ? theme.primary : theme.textMuted} />
                {!collapsed && <span>{item.label}</span>}
              </a>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${theme.border}`, fontSize: "11px", color: theme.textSubtle }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: theme.success, display: "inline-block" }} />
              <span>System online</span>
            </div>
            <div>v1.0 · EIP-7702 ready</div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top bar */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: `rgba(10,12,24,0.8)`,
            backdropFilter: "blur(12px)",
            borderBottom: `1px solid ${theme.border}`,
            padding: "16px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px"
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>{title}</h1>}
            {subtitle && <p style={{ margin: "2px 0 0", fontSize: "13px", color: theme.textMuted }}>{subtitle}</p>}
          </div>
          {actions && <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>{actions}</div>}
        </header>

        {/* Content */}
        <main style={{ padding: "28px" }}>{children}</main>
      </div>
    </div>
  );
}
