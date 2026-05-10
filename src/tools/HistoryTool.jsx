import { useState, useEffect } from "react";
import { Header, Icon, API_BASE } from "../shared.jsx";

const TYPE_LABELS = {
  dataLayerScript: { label: "Data Layer Script", color: "var(--accent)", short: "DL" },
  headSnippet: { label: "Head Snippet (GA4/GTM/GSC)", color: "#A78BFA", short: "HD" },
  seoSchema: { label: "SEO Schema (JSON-LD)", color: "var(--warn)", short: "LD" }
};

function relativeTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function HistoryTool({ onHome }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [clearing, setClearing] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/injection-log?limit=500`);
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setData(body);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function clearAll() {
    if (!confirm("Clear all injection log entries? Cannot be undone. Contentful entries remain — this only clears the local audit trail.")) return;
    setClearing(true);
    try {
      await fetch(`${API_BASE}/injection-log`, { method: "DELETE" });
      await load();
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggle(idx) {
    setExpanded(p => ({ ...p, [idx]: !p[idx] }));
  }

  function copyScript(code) {
    if (code) navigator.clipboard.writeText(code);
  }

  const entries = data?.entries || [];
  const filtered = entries.filter(e => {
    if (filter !== "all" && e.type !== filter) return false;
    if (statusFilter === "success" && !e.success) return false;
    if (statusFilter === "failed" && e.success) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${e.type} ${e.contentTypeId || ""} ${e.toolType || ""} ${e.identifier || ""} ${e.entryId || ""} ${e.error || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const byTypeFromSummary = data?.summary?.byType || {};

  return (
    <div className="app">
      <Header title="Injection History" subtitle="Local audit trail of every injection attempt" onHome={onHome} />
      <p className="phase-title">Audit Trail</p>
      <p className="phase-sub">
        Logged on the server every time OmniTrack hits Contentful CMA. Includes successes + failures. No Contentful credentials needed to view.
      </p>

      {err && <div className="status-row error"><Icon name="x" /> {err}</div>}

      <div className="actions">
        <button className="btn btn-ghost" onClick={onHome}><Icon name="back" /> Home</button>
        <div className="spacer" />
        <button className="btn btn-ghost" onClick={clearAll} disabled={clearing || !entries.length}>
          {clearing ? "Clearing..." : <><Icon name="x" /> Clear Log</>}
        </button>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          {loading ? <><span className="spinner" /> Loading...</> : <><Icon name="refresh" /> Refresh</>}
        </button>
      </div>

      {data && (
        <>
          <div className="status-row success" style={{ marginTop: 16 }}>
            <Icon name="check" /> {data.summary.total} total injection{data.summary.total === 1 ? "" : "s"}
            {data.summary.lastAt && <span style={{ marginLeft: 12, opacity: 0.7 }}>{"·"} last: {relativeTime(data.summary.lastAt)}</span>}
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, opacity: 0.7 }}>
              {data.summary.totalChars.toLocaleString()} chars total
            </span>
          </div>

          {entries.length === 0 && (
            <div className="card">
              <div className="empty-state">
                <div className="big">{"⌕"}</div>
                <div>No injections logged yet.</div>
                <br />
                <div style={{ fontSize: 12, color: "var(--text2)", maxWidth: 480, lineHeight: 1.6 }}>
                  Run an injection from Data Layer, GA4, GTM, GSC, or Schema tools.
                  Every successful + failed inject lands here automatically.
                </div>
              </div>
            </div>
          )}

          {entries.length > 0 && (
            <div className="card">
              <div className="card-title"><span className="dot" />Filter</div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className={`event-tag clickable ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
                    all ({entries.length})
                  </span>
                  {Object.entries(byTypeFromSummary).map(([ct, n]) => (
                    <span key={ct} className={`event-tag clickable ${filter === ct ? "active" : ""}`} onClick={() => setFilter(ct)}>
                      {TYPE_LABELS[ct]?.label || ct} ({n})
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span className={`event-tag clickable ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>any status</span>
                  <span className={`event-tag clickable ${statusFilter === "success" ? "active" : ""}`} onClick={() => setStatusFilter("success")}>success</span>
                  <span className={`event-tag clickable ${statusFilter === "failed" ? "active" : ""}`} onClick={() => setStatusFilter("failed")}>failed</span>
                </div>
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, minWidth: 200, padding: "8px 12px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, color: "#E8EDF5", fontSize: 12, fontFamily: "var(--mono)" }}
                />
              </div>
            </div>
          )}

          {entries.length > 0 && (
            <div className="card">
              <div className="card-title">
                <span className="dot" />Injections
                <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "var(--mono)", color: "var(--text2)" }}>
                  {filtered.length} of {entries.length} shown
                </span>
              </div>
              {filtered.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                  No entries match current filters.
                </div>
              )}
              {filtered.map((e, idx) => {
                const meta = TYPE_LABELS[e.type] || { label: e.type, color: "var(--text2)", short: "??" };
                const open = expanded[idx];
                const label = e.contentTypeId || e.toolType || e.schemaType || e.identifier || "(no label)";
                return (
                  <div key={`${e.ts}-${idx}`} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => toggle(idx)}>
                      <span style={{ flex: "0 0 36px", height: 28, borderRadius: 6, background: "rgba(255,255,255,0.05)", color: meta.color, fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: 0.5 }}>
                        {meta.short}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "#E8EDF5", fontWeight: 500 }}>
                          {label}
                          {e.identifier && e.identifier !== label && (
                            <span style={{ marginLeft: 8, color: "var(--text3)", fontWeight: 400 }}>{e.identifier}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 2 }}>
                          {e.entryId || "(no entry)"} {"·"} {(e.scriptLength || 0).toLocaleString()} chars
                          {Array.isArray(e.events) && e.events.length > 0 && (
                            <> {"·"} events: {e.events.slice(0, 4).join(", ")}{e.events.length > 4 ? ` +${e.events.length - 4}` : ""}</>
                          )}
                          {e.spaceId && <> {"·"} space: {e.spaceId.slice(0, 12)}</>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span className={`badge ${e.success ? "badge-green" : "badge-red"}`}>{e.success ? "✓ OK" : "✗ Fail"}</span>
                        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)", minWidth: 70, textAlign: "right" }}>
                          {relativeTime(e.ts)}
                        </span>
                        <span style={{ fontSize: 14, color: "var(--text3)" }}>{open ? "▾" : "▸"}</span>
                      </div>
                    </div>
                    {open && (
                      <div style={{ marginTop: 10, marginLeft: 48 }}>
                        <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)", marginBottom: 8, flexWrap: "wrap" }}>
                          <span>at: {new Date(e.ts).toLocaleString()}</span>
                          {e.spaceId && <span>space: {e.spaceId}</span>}
                          {e.entryId && <span>entryId: {e.entryId}</span>}
                          {e.toolType && <span>tool: {e.toolType}</span>}
                          {e.schemaType && <span>schema: {e.schemaType}</span>}
                        </div>
                        {e.error && (
                          <div style={{ background: "rgba(255,77,106,0.08)", border: "1px solid rgba(255,77,106,0.3)", color: "var(--danger)", padding: 10, borderRadius: 6, fontSize: 11, fontFamily: "var(--mono)", marginBottom: 8 }}>
                            ✗ {e.error}
                          </div>
                        )}
                        {e.scriptCode && (
                          <div style={{ position: "relative" }}>
                            <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: 12, fontSize: 10, lineHeight: 1.5, maxHeight: 320, overflow: "auto", margin: 0 }}>
                              {e.scriptCode}
                            </pre>
                            <button className="copy-btn" onClick={() => copyScript(e.scriptCode)} style={{ position: "absolute", top: 8, right: 8 }}>⧇ Copy</button>
                          </div>
                        )}
                        {!e.scriptCode && !e.error && (
                          <div style={{ fontSize: 11, color: "var(--text3)", fontStyle: "italic" }}>(no script body logged)</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
