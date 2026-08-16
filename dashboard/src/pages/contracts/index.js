import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import Shell from "../../components/Shell";
import Icon from "../../components/Icon";
import { Modal, Toast, Spinner, EmptyState } from "../../components/Modal";
import { theme, btn, cardStyle, inputStyle, labelStyle, badge } from "../../components/theme";

export default function ContractsPage() {
  const [registry, setRegistry] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [toast, setToast] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/contracts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRegistry(data);
      if (data.contracts?.length && !selected) setSelected(data.contracts[0].name);
    } catch (e) { setError(e.message); }
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      const res = await fetch("/api/contracts/regenerate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Regeneration failed");
      setToast({ kind: "success", message: `Regenerated: ${data.contractCount} contracts discovered` });
      await load();
    } catch (e) {
      setToast({ kind: "error", message: e.message });
    } finally { setRegenerating(false); }
  }

  async function onAdded(result) {
    setAddOpen(false);
    setToast({
      kind: "success",
      message: `Added ${result.filename} — ${result.contractCount} contracts now in registry`,
      duration: 6000
    });
    await load();
    if (result.contracts) {
      const added = result.contracts.find((c) => result.filename.replace(/\.sol$/, "").includes(c.name));
      if (added) setSelected(added.name);
    }
  }

  const contracts = (registry?.contracts || []).filter((c) =>
    !query || c.name.toLowerCase().includes(query.toLowerCase())
  );
  const current = registry?.contracts?.find((c) => c.name === selected);

  const stats = registry
    ? {
        total: registry.contractCount,
        deployable: registry.contracts.filter((c) => c.isDeployable).length,
        interfaces: registry.contracts.filter((c) => c.isInterface).length,
        functions: registry.contracts.reduce((s, c) => s + c.functions.length, 0)
      }
    : { total: 0, deployable: 0, interfaces: 0, functions: 0 };

  return (
    <Shell
      title="Contracts"
      subtitle="Smart contract library — auto-discovered from contracts/. Add new contracts anytime."
      actions={
        <>
          <button onClick={regenerate} disabled={regenerating} style={btn("secondary", { disabled: regenerating, size: "sm" })}>
            {regenerating ? <Spinner size={14} color={theme.textMuted} /> : <Icon name="refresh" size={15} />}
            Regenerate
          </button>
          <button onClick={() => setAddOpen(true)} style={btn("primary", { size: "sm" })}>
            <Icon name="plus" size={15} /> Add Contract
          </button>
        </>
      }
    >
      <Head><title>Contracts · Composer</title></Head>

      {/* Stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
        <StatCard icon="box" label="Total Contracts" value={stats.total} color={theme.primary} />
        <StatCard icon="layers" label="Deployable" value={stats.deployable} color={theme.success} />
        <StatCard icon="code" label="Interfaces" value={stats.interfaces} color={theme.warning} />
        <StatCard icon="bolt" label="Functions" value={stats.functions} color={theme.info} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "20px", alignItems: "start" }}>
        {/* Left: list + search */}
        <div>
          <div style={{ position: "relative", marginBottom: "12px" }}>
            <Icon name="search" size={16} color={theme.textSubtle} style={{ position: "absolute", left: "11px", top: "10px" }} />
            <input
              placeholder="Search contracts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ ...inputStyle, paddingLeft: "34px" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
            {contracts.length === 0 && (
              <EmptyState icon="contracts" title="No contracts found" description={query ? "Try a different search." : "Add your first contract."} />
            )}
            {contracts.map((c) => (
              <button
                key={c.name}
                onClick={() => setSelected(c.name)}
                className="cw-fadein"
                style={{
                  display: "block", textAlign: "left", padding: "12px 14px",
                  background: selected === c.name ? theme.surfaceActive : theme.surface,
                  color: theme.text,
                  border: selected === c.name ? `1px solid ${theme.primary}` : `1px solid ${theme.border}`,
                  borderRadius: theme.radius.md, cursor: "pointer",
                  transition: "all 0.15s"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                  <strong style={{ fontSize: "13px" }}>{c.name}</strong>
                  <span style={badge(c.isInterface ? "warning" : "success")}>
                    {c.isInterface ? "interface" : "deployable"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "10px", fontSize: "11px", color: theme.textSubtle }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                    <Icon name="bolt" size={11} /> {c.functions.length}
                  </span>
                  {c.events?.length > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <Icon name="sparkles" size={11} /> {c.events.length}
                    </span>
                  )}
                  <span style={{ opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.source}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: detail */}
        <div>
          {error && <ErrorBanner message={error} />}
          {!current && !error && <EmptyState icon="contracts" title="Select a contract" description="Pick one from the left to inspect its ABI." />}
          {current && <ContractDetail contract={current} />}
        </div>
      </div>

      <AddContractModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={onAdded} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Shell>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ ...cardStyle, padding: "16px", display: "flex", alignItems: "center", gap: "14px" }}>
      <div style={{
        width: "40px", height: "40px", borderRadius: "10px",
        background: `${color}1a`, color,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
      }}>
        <Icon name={icon} size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: "22px", fontWeight: 700, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: "11px", color: theme.textMuted, marginTop: "3px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      </div>
    </div>
  );
}

function ContractDetail({ contract }) {
  const [tab, setTab] = useState("functions");
  const [copied, setCopied] = useState(false);

  const tabs = [
    { id: "functions", label: `Functions (${contract.functions.length})`, icon: "bolt" },
    { id: "events", label: `Events (${contract.events?.length || 0})`, icon: "sparkles" },
    { id: "abi", label: "Raw ABI", icon: "code" }
  ];

  async function copyAbi() {
    try {
      const res = await fetch(`/api/contracts/${contract.name}/abi`);
      const data = await res.json();
      await navigator.clipboard.writeText(JSON.stringify(data.abi, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="cw-fadein">
      <div style={{ ...cardStyle, padding: "20px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>{contract.name}</h2>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
              <span style={badge(contract.isInterface ? "warning" : "success")}>
                {contract.isInterface ? "interface" : contract.isDeployable ? "deployable" : "abstract"}
              </span>
              <span style={badge("muted")}><Icon name="file" size={11} /> {contract.source}</span>
              <span style={badge("primary")}><Icon name="bolt" size={11} /> {contract.functions.length} functions</span>
              {contract.events?.length > 0 && <span style={badge("info")}><Icon name="sparkles" size={11} /> {contract.events.length} events</span>}
            </div>
          </div>
          <button onClick={copyAbi} style={btn("secondary", { size: "sm" })}>
            <Icon name={copied ? "check" : "copy"} size={14} color={copied ? theme.success : theme.textMuted} />
            {copied ? "Copied" : "Copy ABI"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px", borderBottom: `1px solid ${theme.border}` }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 14px", background: "transparent", border: "none",
              borderBottom: tab === t.id ? `2px solid ${theme.primary}` : "2px solid transparent",
              color: tab === t.id ? theme.text : theme.textMuted,
              cursor: "pointer", fontSize: "13px", fontWeight: 600,
              display: "inline-flex", alignItems: "center", gap: "6px",
              marginBottom: "-1px"
            }}
          >
            <Icon name={t.icon} size={14} color={tab === t.id ? theme.primary : theme.textMuted} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "functions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {contract.functions.map((fn, i) => <FunctionRow key={i} fn={fn} />)}
        </div>
      )}
      {tab === "events" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {(contract.events || []).length === 0 && <EmptyState icon="sparkles" title="No events" />}
          {(contract.events || []).map((ev, i) => (
            <div key={i} style={{ ...cardStyle, padding: "12px 16px", fontSize: "13px" }}>
              <code style={{ color: theme.warning, fontFamily: theme.font.mono }}>{ev.name}</code>
              <span style={{ color: theme.textMuted }}> ({(ev.inputs || []).map((a) => `${a.type}${a.indexed ? " indexed" : ""} ${a.name || ""}`).join(", ")})</span>
            </div>
          ))}
        </div>
      )}
      {tab === "abi" && <RawAbi name={contract.name} />}
    </div>
  );
}

function FunctionRow({ fn }) {
  const mutabilityLabel = fn.stateMutability === "payable" ? "payable" : fn.stateMutability === "view" ? "view" : fn.stateMutability === "pure" ? "pure" : "write";

  return (
    <div style={{ ...cardStyle, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <code style={{ color: theme.primary, fontFamily: theme.font.mono, fontSize: "14px", fontWeight: 600 }}>{fn.name}</code>
        <span style={{ ...badge(mutabilityLabel === "payable" ? "success" : mutabilityLabel === "view" || mutabilityLabel === "pure" ? "warning" : "primary"), fontFamily: theme.font.mono }}>
          {mutabilityLabel}
        </span>
      </div>
      {fn.inputs.length > 0 && (
        <div style={{ marginTop: "8px", fontSize: "12px" }}>
          <div style={{ color: theme.textSubtle, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "10px", marginBottom: "4px" }}>Inputs</div>
          {fn.inputs.map((a, i) => (
            <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginRight: "12px", marginBottom: "4px" }}>
              <code style={{ color: theme.info, fontFamily: theme.font.mono }}>{a.type}</code>
              {a.name && <span style={{ color: theme.textMuted }}>{a.name}</span>}
            </div>
          ))}
        </div>
      )}
      {fn.outputs.length > 0 && (
        <div style={{ marginTop: "8px", fontSize: "12px" }}>
          <div style={{ color: theme.textSubtle, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "10px", marginBottom: "4px" }}>Returns</div>
          {fn.outputs.map((o, i) => (
            <code key={i} style={{ color: theme.success, fontFamily: theme.font.mono, marginRight: "12px" }}>{o.type}</code>
          ))}
        </div>
      )}
    </div>
  );
}

function RawAbi({ name }) {
  const [abi, setAbi] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/contracts/${name}/abi`).then((r) => r.json()).then((d) => { setAbi(d.abi); setLoading(false); });
  }, [name]);
  if (loading) return <div style={{ textAlign: "center", padding: "40px" }}><Spinner size={20} color={theme.primary} /></div>;
  return (
    <pre style={{
      background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radius.md,
      padding: "16px", overflow: "auto", fontSize: "12px", fontFamily: theme.font.mono,
      color: theme.text, maxHeight: "500px", margin: 0
    }}>
      {JSON.stringify(abi, null, 2)}
    </pre>
  );
}

function ErrorBanner({ message }) {
  return (
    <div style={{
      background: theme.dangerBg, border: `1px solid ${theme.dangerBorder}`, color: theme.danger,
      borderRadius: theme.radius.lg, padding: "14px 16px", fontSize: "13px",
      display: "flex", alignItems: "center", gap: "10px"
    }}>
      <Icon name="alert" size={18} /> {message}
    </div>
  );
}

// ---- Add Contract Modal ----
function AddContractModal({ open, onClose, onAdded }) {
  const [mode, setMode] = useState("paste"); // "paste" | "upload"
  const [name, setName] = useState("");
  const [source, setSource] = useState(SAMPLE);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  function reset() { setErr(null); setName(""); setSource(SAMPLE); setFile(null); setMode("paste"); }

  async function submit() {
    setBusy(true); setErr(null);
    try {
      let res;
      if (mode === "upload") {
        if (!file) { setErr("Choose a .sol file first."); setBusy(false); return; }
        const fd = new FormData();
        fd.append("file", file);
        res = await fetch("/api/contracts/add", { method: "POST", body: fd });
      } else {
        if (!name.trim()) { setErr("Enter a contract name (e.g. MyToken.sol)."); setBusy(false); return; }
        if (!source.trim()) { setErr("Paste Solidity source first."); setBusy(false); return; }
        res = await fetch("/api/contracts/add", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), source })
        });
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        let msg = data.error || "Failed to add contract";
        if (data.compileErrors) msg = msg + "\n\n" + data.compileErrors;
        setErr(msg);
        setBusy(false);
        return;
      }
      reset();
      onAdded(data);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Add Smart Contract"
      subtitle="Upload a .sol file or paste Solidity source. It compiles and joins the registry automatically."
      width={680}
    >
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: "4px", background: theme.bg, padding: "4px", borderRadius: theme.radius.md, marginBottom: "18px" }}>
        {[{ id: "paste", label: "Paste Source", icon: "code" }, { id: "upload", label: "Upload .sol", icon: "upload" }].map((m) => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); setErr(null); }}
            style={{
              flex: 1, padding: "8px 12px", background: mode === m.id ? theme.surfaceActive : "transparent",
              border: "none", borderRadius: "6px", color: mode === m.id ? theme.text : theme.textMuted,
              cursor: "pointer", fontSize: "13px", fontWeight: 600,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px"
            }}
          >
            <Icon name={m.icon} size={15} /> {m.label}
          </button>
        ))}
      </div>

      {mode === "paste" && (
        <>
          <label style={labelStyle}>Contract file name</label>
          <input
            placeholder="e.g. MyToken.sol"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...inputStyle, marginBottom: "14px", fontFamily: theme.font.mono }}
          />
          <label style={labelStyle}>Solidity source</label>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={14}
            style={{
              ...inputStyle, fontFamily: theme.font.mono, fontSize: "12px", lineHeight: 1.5,
              minHeight: "280px", resize: "vertical"
            }}
          />
        </>
      )}

      {mode === "upload" && (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = theme.primary; e.currentTarget.style.background = theme.gradientSubtle; }}
          onDragLeave={(e) => { e.currentTarget.style.borderColor = theme.borderStrong; e.currentTarget.style.background = theme.bg; }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = theme.borderStrong; e.currentTarget.style.background = theme.bg;
            const f = e.dataTransfer.files?.[0];
            if (f) setFile(f);
          }}
          style={{
            border: `2px dashed ${theme.borderStrong}`, borderRadius: theme.radius.lg,
            padding: "48px 20px", textAlign: "center", cursor: "pointer",
            background: theme.bg, transition: "all 0.15s"
          }}
        >
          <input
            ref={fileRef} type="file" accept=".sol" style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: theme.surface, border: `1px solid ${theme.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
            <Icon name="upload" size={24} color={theme.primary} />
          </div>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>
            {file ? file.name : "Drop a .sol file here or click to browse"}
          </div>
          <div style={{ fontSize: "12px", color: theme.textMuted }}>
            {file ? `${(file.size / 1024).toFixed(1)} KB` : "Solidity source files only"}
          </div>
        </div>
      )}

      {err && (
        <div style={{
          marginTop: "14px", background: theme.dangerBg, border: `1px solid ${theme.dangerBorder}`,
          color: theme.danger, borderRadius: theme.radius.md, padding: "12px 14px",
          fontSize: "12px", fontFamily: theme.font.mono, whiteSpace: "pre-wrap",
          maxHeight: "200px", overflow: "auto"
        }}>
          <Icon name="alert" size={14} /> <strong>Compile error:</strong>
          {"\n\n"}{err}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
        <button onClick={() => { reset(); onClose(); }} disabled={busy} style={btn("ghost", { size: "sm" })}>Cancel</button>
        <button onClick={submit} disabled={busy} style={btn("primary", { size: "sm" })}>
          {busy ? <Spinner size={14} color="#fff" /> : <Icon name="plus" size={15} />}
          {busy ? "Compiling…" : "Add & Compile"}
        </button>
      </div>
    </Modal>
  );
}

const SAMPLE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MyContract {
    address public owner;
    mapping(address => uint256) public balances;

    event Deposited(address indexed user, uint256 amount);

    constructor() { owner = msg.sender; }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }
}`;
