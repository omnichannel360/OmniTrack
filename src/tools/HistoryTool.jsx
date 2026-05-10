import { useState, useEffect } from "react";
import { Header, Icon, ContentfulCredsCard, useLocalConfig, API_BASE } from "../shared.jsx";

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
  const [config, setConfig] = useLocalConfig("omnitrack:history", {
    spaceId: "", cdaToken: "", environment: "master"
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [fullScripts, setFullScripts] = useState({});

  async function load() {
    setLoading(true);
    setErr("");
    setData(null);
    try {
      const qs = new URLSearchParams({
        spaceId: config.spaceId,
        cdaToken: config.cdaToken,
        environment: config.environment || "master",
        limit: "200"
      });
      const r = await fetch(`${API_BASE}/contentful/history?${qs.toString()}`);
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setData(body);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchFullScript(entryId) {
    if (fullScripts[entryId]) return;
    try {
      const qs = new URLSearchParams({
        spaceId: config.spaceId,
        cdaToken: config.cdaToken,
        environment: config.environment || "master"
      });
      const r = await fetch(`${API_BASE}/contentful/entry/${entryId}?${qs.toString()}`);
      const body = await r.json();
      if (r.ok) {
        const f = body.fields || {};
        setFullScripts(p => ({ ...p, [entryId]: f.scriptCode || f.code || f.jsonLd || "(empty)" }));
      }
    } catch {}
  }

  function toggle(entryId) {
    const isOpen = expanded[entryId];
    setExpanded(p => ({ ...p, [entryId]: !isOpen }));
    if (!isOpen) fetchFullScript(entryId);
  }

  function copyScript(entryId) {
    const code = fullScripts[entryId];
    if (code) navigator.clipboard.writeText(code);
  }

  // Auto-load when creds present
  useEffect(() => {
    if (config.spaceId && config.cdaToken) load();
  }, []); // eslint-disable-line

  const entries = data?.entries || [];
  const filtered = entries.filter(e => {
    if (filter !== "all" && e.contentType !== filter) return false;
    if (statusFilter === "published" && !e.isPublished) return false;
    if (statusFilter === "draft" && e.isPublished) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(e.contentTypeId || "").toLowerCase().includes(q) &&
          !(e.entryId || "").toLowerCase().includes(q) &&
          !(e.identifier || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="app">
      <Header title="Injection History" subtitle="Audit log of all entries injected via OmniTrack" onHome={onHome} />
      <p className="phase-title">Audit Trail</p>
      <p className="phase-sub">
        Lists every Contentful entry created by OmniTrack across <code>dataLayerScript</code>, <code>headSnippet</code>, and <code>seoSchema</code> models. Click any row to inspect script body.
      </p>

      <ContentfulCredsCard config={config} setConfig={setConfig} />

      {err && <div className="status-row error"><Icon name="x" /> {err}</div>}

      <div className="actions">
        <button className="btn btn-ghost" onClick={onHome}><Icon name="back" /> Home</button>
        <div className="spacer" />
        <button className="btn btn-primary" disabled={!config.spaceId || !config.cdaToken || loading} onClick={load}>
          {loading ? <><span className="spinner" /> Loading...</> : <><Icon name="refresh" /> Refresh</>}
        </button>
      </div>

      {data && (
        <>
          <div className="status-row success" style={{ marginTop: 16 }}>
            <Icon name="check" /> {data.summary.total} entries across {Object.keys(data.summary.byContentType).length} content types
            <span style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 11, fontFamily: "var(--mono)" }}>
              <span style={{ color: "var(--ok, #4ade80)" }}>● {data.summary.published} published</span>
              <span style={{ color: "var(--warn)" }}>○ {data.summary.drafts} drafts</span>
            </span>
          </div>

          <div className="card">
            <div className="card-title"><span className="dot" />Filter</div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className={`event-tag clickable ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
                  all ({entries.length})
                </span>
                {Object.entries(data.summary.byContentType).map(([ct, n]) => (
                  <span key={ct} className={`event-tag clickable ${filter === ct ? "active" : ""}`} onClick={() => setFilter(ct)}>
                    {TYPE_LABELS[ct]?.label || ct} ({n})
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <span className={`event-tag clickable ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>any status</span>
                <span className={`event-tag clickable ${statusFilter === "published" ? "active" : ""}`} onClick={() => setStatusFilter("published")}>published</span>
                <span className={`event-tag clickable ${statusFilter === "draft" ? "active" : ""}`} onClick={() => setStatusFilter("draft")}>drafts</span>
              </div>
              <input
                type="text"
                placeholder="Search by content type, entry ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: 200, padding: "8px 12px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, color: "#E8EDF5", fontSize: 12, fontFamily: "var(--mono)" }}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span className="dot" />Entries
              <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "var(--mono)", color: "var(--text2)" }}>
                {filtered.length} of {entries.length} shown
              </span>
            </div>
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                No entries match current filters.
              </div>
            )}
            {filtered.map(e => {
              const meta = TYPE_LABELS[e.contentType] || { label: e.contentType, color: "var(--text2)", short: "??" };
              const open = expanded[e.entryId];
              return (
                <div key={e.entryId} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => toggle(e.entryId)}>
                    <span style={{ flex: "0 0 36px", height: 28, borderRadius: 6, background: "rgba(255,255,255,0.05)", color: meta.color, fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: 0.5 }}>
                      {meta.short}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "#E8EDF5", fontWeight: 500 }}>
                        {e.contentTypeId}
                        {e.identifier && <span style={{ marginLeft: 8, color: "var(--text3)", fontWeight: 400 }}>{e.identifier}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 2 }}>
                        {e.entryId} {"·"} {e.scriptLength.toLocaleString()} chars
                        {Array.isArray(e.events) && e.events.length > 0 && (
                          <> {"·"} events: {e.events.slice(0, 4).join(", ")}{e.events.length > 4 ? ` +${e.events.length - 4}` : ""}</>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span className={`badge ${e.isPublished ? "badge-green" : "badge-warn"}`}>{e.isPublished ? "✓ Published" : "Draft"}</span>
                      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)", minWidth: 60, textAlign: "right" }}>
                        {relativeTime(e.createdAt)}
                      </span>
                      <span style={{ fontSize: 14, color: "var(--text3)" }}>{open ? "▾" : "▸"}</span>
                    </div>
                  </div>
                  {open && (
                    <div style={{ marginTop: 10, marginLeft: 48 }}>
                      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)", marginBottom: 8 }}>
                        <span>created: {new Date(e.createdAt).toLocaleString()}</span>
                        <span>updated: {new Date(e.updatedAt).toLocaleString()}</span>
                        {e.publishedAt && <span>published: {new Date(e.publishedAt).toLocaleString()}</span>}
                      </div>
                      <div style={{ position: "relative" }}>
                        <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: 12, fontSize: 10, lineHeight: 1.5, maxHeight: 320, overflow: "auto", margin: 0 }}>
                          {fullScripts[e.entryId] || "Loading..."}
                        </pre>
                        {fullScripts[e.entryId] && (
                          <button className="copy-btn" onClick={() => copyScript(e.entryId)} style={{ position: "absolute", top: 8, right: 8 }}>⧇ Copy</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
