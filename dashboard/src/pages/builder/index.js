import { useState, useEffect } from "react";
import Head from "next/head";
import Shell from "../../components/Shell";
import Icon from "../../components/Icon";
import { Toast, Spinner, EmptyState } from "../../components/Modal";
import { theme, btn, cardStyle, inputStyle, labelStyle, badge } from "../../components/theme";
import { listModules, getModule } from "../../composer/modules";

const CATEGORIES = [
  { id: "sign", label: "Signing", icon: "bolt" },
  { id: "batch", label: "Batching & Calls", icon: "layers" },
  { id: "session", label: "Session", icon: "wallet" },
  { id: "delegate", label: "Delegate", icon: "puzzle" }
];

export default function Builder() {
  const modules = listModules();
  const [client, setClient] = useState({
    id: "client-x",
    name: "Client X",
    chainId: "11155111",
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/demo",
    reownProjectId: "",
    process: []
  });
  const [buildResult, setBuildResult] = useState(null);
  const [building, setBuilding] = useState(false);
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);
  const [registry, setRegistry] = useState(null);
  const [abis, setAbis] = useState({}); // contractName -> abi (cached)

  useEffect(() => {
    fetch("/api/contracts").then((r) => r.json()).then((d) => setRegistry(d)).catch(() => {});
  }, []);

  async function getAbi(contractName) {
    if (abis[contractName]) return abis[contractName];
    const res = await fetch(`/api/contracts/${contractName}/abi`);
    const data = await res.json();
    setAbis((a) => ({ ...a, [contractName]: data.abi }));
    return data.abi;
  }

  function addModule(moduleId) {
    const mod = getModule(moduleId);
    const config = {};
    for (const f of mod.fields) if (f.default !== undefined) config[f.key] = f.default;
    setClient((c) => ({ ...c, process: [...c.process, { moduleId, config }] }));
  }

  function removeStep(index) {
    setClient((c) => ({ ...c, process: c.process.filter((_, i) => i !== index) }));
  }

  function moveStep(index, dir) {
    setClient((c) => {
      const p = [...c.process];
      const j = index + dir;
      if (j < 0 || j >= p.length) return c;
      [p[index], p[j]] = [p[j], p[index]];
      return { ...c, process: p };
    });
  }

  function updateField(stepIndex, key, value) {
    setClient((c) => {
      const p = [...c.process];
      p[stepIndex] = { ...p[stepIndex], config: { ...p[stepIndex].config, [key]: value } };
      return { ...c, process: p };
    });
  }

  function updateClient(key, value) {
    setClient((c) => ({ ...c, [key]: value }));
  }

  async function buildWidget() {
    setBuilding(true); setBuildResult(null);
    try {
      const res = await fetch("/api/builder/build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(client)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Build failed");
      setBuildResult(data);
    } catch (e) {
      setBuildResult({ error: e.message });
    } finally { setBuilding(false); }
  }

  async function copyEmbed() {
    if (!buildResult?.embed) return;
    await navigator.clipboard.writeText(buildResult.embed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setToast({ kind: "success", message: "Embed snippet copied to clipboard" });
  }

  const contractNames = registry?.contracts?.map((c) => c.name) || [];

  return (
    <Shell
      title="Widget Builder"
      subtitle="Compose transaction logic from modules, configure per client, bundle to a single widget.js."
      actions={
        <button onClick={buildWidget} disabled={building || client.process.length === 0} style={btn("primary", { disabled: building || client.process.length === 0, size: "sm" })}>
          {building ? <Spinner size={14} color="#fff" /> : <Icon name="bolt" size={15} />}
          {building ? "Bundling…" : "Build widget.js"}
        </button>
      }
    >
      <Head><title>Widget Builder · Composer</title></Head>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 360px", gap: "18px", alignItems: "start" }}>
        {/* Module palette */}
        <div style={{ position: "sticky", top: "84px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: theme.textSubtle, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>
            Modules
          </div>
          {CATEGORIES.map((cat) => (
            <div key={cat.id} style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", color: theme.textMuted, marginBottom: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
                <Icon name={cat.icon} size={13} /> {cat.label}
              </div>
              {modules
                .filter((m) => m.category === cat.id)
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => addModule(m.id)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "10px 12px", marginBottom: "6px",
                      background: theme.surface, color: theme.text,
                      border: `1px solid ${theme.border}`, borderRadius: theme.radius.md,
                      cursor: "pointer", fontSize: "13px", transition: "all 0.15s"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.primary; e.currentTarget.style.background = theme.surfaceHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.background = theme.surface; }}
                  >
                    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                      <Icon name="plus" size={12} color={theme.primary} /> {m.name}
                    </div>
                    <div style={{ opacity: 0.55, fontSize: "11px", marginTop: "3px", lineHeight: 1.4 }}>{m.description}</div>
                  </button>
                ))}
            </div>
          ))}
        </div>

        {/* Process canvas */}
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: theme.textSubtle, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>
            Process ({client.process.length} steps)
          </div>
          {client.process.length === 0 && (
            <EmptyState
              icon="builder"
              title="Build your transaction flow"
              description="Add modules from the left. Drag is not required — order with ↑↓."
              action={<span style={{ fontSize: "12px", color: theme.textSubtle }}>Try Contract Call → it auto-loads ABIs from the registry</span>}
            />
          )}
          {client.process.map((step, i) => {
            const mod = getModule(step.moduleId);
            return (
              <div key={i} className="cw-fadein" style={{ ...cardStyle, marginBottom: "12px", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "26px", height: "26px", borderRadius: "8px",
                      background: theme.gradientSubtle, color: theme.primary,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "13px", fontWeight: 700
                    }}>{i + 1}</div>
                    <strong style={{ fontSize: "14px" }}>{mod.name}</strong>
                    {mod.category === "batch" && step.moduleId === "contractCall" && step.config.contractName && (
                      <span style={badge("info")}><Icon name="box" size={11} /> {step.config.contractName}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <IconBtn icon="arrowUp" onClick={() => moveStep(i, -1)} />
                    <IconBtn icon="arrowDown" onClick={() => moveStep(i, 1)} />
                    <IconBtn icon="trash" color={theme.danger} onClick={() => removeStep(i)} />
                  </div>
                </div>

                {/* Smart fields: contractCall uses the registry-aware picker */}
                {step.moduleId === "contractCall" ? (
                  <ContractCallFields step={step} updateField={(k, v) => updateField(i, k, v)} contractNames={contractNames} getAbi={getAbi} />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    {mod.fields.map((f) => (
                      <Field key={f.key} field={f} value={step.config[f.key] || ""} onChange={(v) => updateField(i, f.key, v)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Client config + result */}
        <div style={{ position: "sticky", top: "84px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: theme.textSubtle, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>
            Client Config
          </div>
          <div style={{ ...cardStyle, marginBottom: "16px" }}>
            <Field field={{ key: "id", label: "Client ID", type: "string", required: true }} value={client.id} onChange={(v) => updateClient("id", v)} />
            <Field field={{ key: "name", label: "Display Name", type: "string", required: true }} value={client.name} onChange={(v) => updateClient("name", v)} />
            <Field field={{ key: "chainId", label: "Chain ID", type: "string", required: true }} value={client.chainId} onChange={(v) => updateClient("chainId", v)} />
            <Field field={{ key: "rpcUrl", label: "RPC URL", type: "string" }} value={client.rpcUrl} onChange={(v) => updateClient("rpcUrl", v)} />
            <Field field={{ key: "reownProjectId", label: "Reown Project ID", type: "string", description: "Free at cloud.reown.com" }} value={client.reownProjectId} onChange={(v) => updateClient("reownProjectId", v)} last />
          </div>

          {/* Build result */}
          {buildResult && !buildResult.error && (
            <div className="cw-fadein" style={{
              background: theme.successBg, border: `1px solid ${theme.successBorder}`,
              borderRadius: theme.radius.lg, padding: "16px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: theme.success, fontWeight: 700, marginBottom: "10px", fontSize: "14px" }}>
                <Icon name="check" size={16} color={theme.success} /> Built successfully
              </div>
              <div style={{ fontSize: "12px", color: theme.textMuted, marginBottom: "8px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <span>{(buildResult.size / 1024).toFixed(1)} KB</span>
                <span style={badge("primary")}>{buildResult.format}</span>
                <span>{buildResult.modules.length} modules</span>
              </div>
              <div style={{ fontSize: "11px", color: theme.textSubtle, marginBottom: "6px" }}>Embed snippet:</div>
              <pre style={{
                background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radius.md,
                padding: "10px", fontSize: "10px", fontFamily: theme.font.mono, color: theme.text,
                maxHeight: "160px", overflow: "auto", whiteSpace: "pre-wrap", margin: "0 0 10px"
              }}>
{buildResult.embed}
              </pre>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={copyEmbed} style={btn("secondary", { size: "sm", style: { flex: 1 } })}>
                  <Icon name={copied ? "check" : "copy"} size={13} color={copied ? theme.success : theme.textMuted} />
                  {copied ? "Copied" : "Copy snippet"}
                </button>
                <a href={buildResult.url} target="_blank" rel="noreferrer" style={btn("ghost", { size: "sm" })}>
                  <Icon name="external" size={13} color={theme.textMuted} /> Open
                </a>
              </div>
            </div>
          )}
          {buildResult?.error && (
            <div style={{
              background: theme.dangerBg, border: `1px solid ${theme.dangerBorder}`, color: theme.danger,
              borderRadius: theme.radius.lg, padding: "14px", fontSize: "13px",
              display: "flex", alignItems: "flex-start", gap: "10px"
            }}>
              <Icon name="alert" size={16} /> <span>{buildResult.error}</span>
            </div>
          )}
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Shell>
  );
}

// ---- Smart ContractCall fields: contract + function dropdowns from ABI ----
function ContractCallFields({ step, updateField, contractNames, getAbi }) {
  const [abi, setAbi] = useState(null);
  const [loadingAbi, setLoadingAbi] = useState(false);
  const contractName = step.config.contractName || "";
  const functionName = step.config.functionName || "";
  const readOnly = step.config.readOnly === "true" || step.config.readOnly === true;

  useEffect(() => {
    if (!contractName) { setAbi(null); return; }
    setLoadingAbi(true);
    getAbi(contractName).then((a) => { setAbi(a); setLoadingAbi(false); }).catch(() => setLoadingAbi(false));
  }, [contractName]);

  const funcs = abi ? abi.filter((e) => e.type === "function") : [];
  const currentFn = funcs.find((f) => f.name === functionName);

  // Auto-set readOnly based on function mutability
  useEffect(() => {
    if (currentFn) {
      const isRead = currentFn.stateMutability === "view" || currentFn.stateMutability === "pure";
      if (isRead !== readOnly) {
        updateField("readOnly", isRead ? "true" : "false");
      }
    }
  }, [currentFn?.name]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={labelStyle}>Contract (from registry)</label>
        <select
          value={contractName}
          onChange={(e) => { updateField("contractName", e.target.value); updateField("functionName", ""); }}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="">Select a contract…</option>
          {contractNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div style={{ gridColumn: "1 / -1" }}>
        <label style={labelStyle}>Function {loadingAbi && <Spinner size={11} color={theme.textMuted} />}</label>
        <select
          value={functionName}
          onChange={(e) => updateField("functionName", e.target.value)}
          disabled={!abi}
          style={{ ...inputStyle, cursor: abi ? "pointer" : "not-allowed", opacity: abi ? 1 : 0.5 }}
        >
          <option value="">{abi ? "Select a function…" : "Pick a contract first"}</option>
          {funcs.map((f, i) => (
            <option key={i} value={f.name}>
              {f.name}({f.inputs.map((a) => a.type).join(",")})
              {f.stateMutability === "payable" ? " · payable" : f.stateMutability === "view" ? " · view" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Show function signature preview */}
      {currentFn && (
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <span style={badge(currentFn.stateMutability === "payable" ? "success" : currentFn.stateMutability === "view" || currentFn.stateMutability === "pure" ? "warning" : "primary")}>
            {currentFn.stateMutability}
          </span>
          {currentFn.inputs.map((a, i) => (
            <span key={i} style={badge("muted")}><code style={{ color: theme.info }}>{a.type}</code> {a.name || `arg${i}`}</span>
          ))}
          {currentFn.outputs.length > 0 && (
            <span style={badge("success")}>returns: {currentFn.outputs.map((o) => o.type).join(", ")}</span>
          )}
        </div>
      )}

      <div style={{ gridColumn: "1 / -1" }}>
        <Field
          field={{ key: "address", label: "Deployed Address", type: "address", required: true }}
          value={step.config.address || ""}
          onChange={(v) => updateField("address", v)}
        />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <Field
          field={{ key: "args", label: `Arguments (comma-separated, in order${currentFn ? `: ${currentFn.inputs.map((a) => a.name || a.type).join(", ")}` : ""})`, type: "string" }}
          value={step.config.args || ""}
          onChange={(v) => updateField("args", v)}
        />
      </div>
      {!readOnly && (
        <Field
          field={{ key: "value", label: "ETH value (wei)", type: "uint256" }}
          value={step.config.value || "0"}
          onChange={(v) => updateField("value", v)}
        />
      )}
      <div>
        <label style={labelStyle}>Mode</label>
        <div style={{
          ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "default"
        }}>
          <span style={{ fontSize: "12px", color: readOnly ? theme.warning : theme.success }}>
            {readOnly ? "read-only (eth_call)" : "write (transaction)"}
          </span>
          <span style={{ fontSize: "10px", color: theme.textSubtle }}>auto from ABI</span>
        </div>
      </div>
    </div>
  );
}

// ---- Generic field ----
function Field({ field, value, onChange, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : "10px" }}>
      <label style={labelStyle}>{field.label}{field.required && <span style={{ color: theme.danger }}> *</span>}</label>
      {field.description && <div style={{ fontSize: "11px", color: theme.textSubtle, marginBottom: "5px" }}>{field.description}</div>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.type}
        style={inputStyle}
      />
    </div>
  );
}

function IconBtn({ icon, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent", border: `1px solid ${theme.border}`, color: color || theme.textMuted,
        borderRadius: "6px", padding: "5px", cursor: "pointer", lineHeight: 0,
        display: "inline-flex", transition: "all 0.15s"
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = color || theme.primary; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; }}
    >
      <Icon name={icon} size={14} color={color || theme.textMuted} />
    </button>
  );
}
