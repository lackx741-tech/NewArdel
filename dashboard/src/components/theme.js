// Design tokens + reusable style helpers for the dashboard.
// Single source of truth for colors, spacing, typography, radii, shadows.

export const theme = {
  bg: "#0a0c18",
  bgElevated: "#10131f",
  surface: "#151829",
  surfaceHover: "#1a1e35",
  surfaceActive: "#1d2138",
  border: "#232744",
  borderStrong: "#313557",

  text: "#e6e8f0",
  textMuted: "#9aa0b8",
  textSubtle: "#5c6280",

  primary: "#667eea",
  primaryHover: "#7c8af0",
  primaryDim: "#3a4a8a",
  accent: "#764ba2",
  success: "#51cf66",
  successBg: "#0d2a14",
  successBorder: "#1f5f30",
  warning: "#ffd43b",
  warningBg: "#2a2310",
  warningBorder: "#5f4a1f",
  danger: "#ff6b6b",
  dangerBg: "#2a0d0d",
  dangerBorder: "#5f1f1f",
  info: "#4dabf7",
  infoBg: "#0d1a2a",

  gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  gradientSubtle: "linear-gradient(135deg, rgba(102,126,234,0.15) 0%, rgba(118,75,162,0.15) 100%)",

  radius: { sm: "6px", md: "8px", lg: "12px", xl: "16px", pill: "999px" },
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.3)",
    md: "0 4px 12px rgba(0,0,0,0.35)",
    lg: "0 12px 32px rgba(0,0,0,0.45)",
    glow: "0 0 0 1px rgba(102,126,234,0.3), 0 8px 24px rgba(102,126,234,0.15)"
  },
  font: {
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "ui-monospace, 'SF Mono', 'Cascadia Code', 'JetBrains Mono', Menlo, monospace"
  },
  spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", xxl: "32px" }
};

// ---- Style "props" (objects) reused across components ----

export const pageStyle = {
  fontFamily: theme.font.sans,
  background: theme.bg,
  color: theme.text,
  minHeight: "100vh",
  margin: 0
};

export const cardStyle = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radius.lg,
  padding: theme.spacing.lg
};

export const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  background: theme.bg,
  color: theme.text,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radius.md,
  fontSize: "13px",
  boxSizing: "border-box",
  fontFamily: theme.font.sans,
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s"
};

export const inputFocusStyle = {
  borderColor: theme.primary,
  boxShadow: `0 0 0 3px rgba(102,126,234,0.15)`
};

export function btn(variant = "primary", opts = {}) {
  const variants = {
    primary: { background: theme.gradient, color: "#fff", border: "none" },
    secondary: { background: theme.surface, color: theme.text, border: `1px solid ${theme.borderStrong}` },
    ghost: { background: "transparent", color: theme.textMuted, border: `1px solid transparent` },
    danger: { background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}` },
    success: { background: theme.successBg, color: theme.success, border: `1px solid ${theme.successBorder}` }
  };
  const v = variants[variant] || variants.primary;
  return {
    ...v,
    padding: opts.compact ? "6px 12px" : "10px 16px",
    borderRadius: theme.radius.md,
    fontWeight: 600,
    fontSize: opts.size === "sm" ? "12px" : "13px",
    cursor: opts.disabled ? "not-allowed" : "pointer",
    opacity: opts.disabled ? 0.5 : 1,
    transition: "all 0.15s",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    textDecoration: "none",
    ...opts.style
  };
}

export const badge = (color = "muted") => {
  const colors = {
    primary: { bg: "rgba(102,126,234,0.15)", fg: theme.primary },
    success: { bg: "rgba(81,207,102,0.15)", fg: theme.success },
    warning: { bg: "rgba(255,212,59,0.15)", fg: theme.warning },
    danger: { bg: "rgba(255,107,107,0.15)", fg: theme.danger },
    info: { bg: "rgba(77,171,247,0.15)", fg: theme.info },
    muted: { bg: "rgba(154,160,184,0.15)", fg: theme.textMuted }
  };
  const c = colors[color] || colors.muted;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: theme.radius.pill,
    background: c.bg,
    color: c.fg,
    fontSize: "11px",
    fontWeight: 600,
    lineHeight: "16px"
  };
};

export const labelStyle = {
  fontSize: "11px",
  fontWeight: 600,
  color: theme.textMuted,
  display: "block",
  marginBottom: "5px",
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};
