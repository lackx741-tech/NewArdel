import { useEffect } from "react";
import Icon from "./Icon";
import { theme } from "./theme";

export function Modal({ open, onClose, title, subtitle, children, width = 560 }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(5,7,17,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "60px 20px", overflowY: "auto"
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: width,
          background: theme.bgElevated,
          border: `1px solid ${theme.borderStrong}`,
          borderRadius: theme.radius.xl,
          boxShadow: theme.shadow.lg,
          overflow: "hidden"
        }}
      >
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "20px 24px", borderBottom: `1px solid ${theme.border}`
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>{title}</h2>
            {subtitle && <p style={{ margin: "4px 0 0", fontSize: "13px", color: theme.textMuted }}>{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer",
              padding: "4px", borderRadius: theme.radius.sm, lineHeight: 0
            }}
          >
            <Icon name="x" size={20} />
          </button>
        </div>
        <div style={{ padding: "24px" }}>{children}</div>
      </div>
    </div>
  );
}

export function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, toast.duration || 5000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const colors = {
    success: { icon: "check", color: theme.success, bg: theme.successBg, border: theme.successBorder },
    error: { icon: "alert", color: theme.danger, bg: theme.dangerBg, border: theme.dangerBorder },
    info: { icon: "sparkles", color: theme.info, bg: theme.infoBg, border: theme.infoBorder }
  };
  const c = colors[toast.kind] || colors.info;
  return (
    <div
      style={{
        position: "fixed", bottom: "24px", right: "24px", zIndex: 200,
        background: c.bg, border: `1px solid ${c.border}`, color: c.color,
        borderRadius: theme.radius.lg, padding: "12px 16px",
        display: "flex", alignItems: "center", gap: "10px",
        boxShadow: theme.shadow.lg, maxWidth: "420px", fontSize: "13px"
      }}
    >
      <Icon name={c.icon} size={18} color={c.color} />
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: c.color, cursor: "pointer", padding: 0, lineHeight: 0, opacity: 0.6 }}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function Spinner({ size = 16, color }) {
  return (
    <span
      style={{
        display: "inline-block", width: size, height: size,
        borderRadius: "50%",
        border: `2px solid ${color || "rgba(255,255,255,0.2)"}`,
        borderTopColor: color || "#fff",
        animation: "cw-spin 0.6s linear infinite"
      }}
    />
  );
}

export function EmptyState({ icon = "search", title, description, action }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: theme.textMuted }}>
      <div style={{
        width: "48px", height: "48px", borderRadius: "12px",
        background: theme.surface, border: `1px solid ${theme.border}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        marginBottom: "16px"
      }}>
        <Icon name={icon} size={24} color={theme.textSubtle} />
      </div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: theme.text, marginBottom: "4px" }}>{title}</div>
      {description && <div style={{ fontSize: "13px", opacity: 0.7 }}>{description}</div>}
      {action && <div style={{ marginTop: "16px" }}>{action}</div>}
    </div>
  );
}
