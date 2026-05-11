import { useState, useEffect } from "react";

export const API_BASE = "/api";

export function Icon({ name, size = 14 }) {
  const icons = {
    check: "\u2713", x: "\u2717", dot: "\u25CF", arrow: "\u2192", copy: "\u29C7",
    plug: "\u26A1", code: "</>", inject: "\u2B95", download: "\u2B07", refresh: "\u27BA",
    back: "\u2190", home: "\u2302", search: "\u2315", tag: "\u25B6", warn: "\u26A0"
  };
  return <span style={{ fontSize: size }}>{icons[name] || "?"}</span>;
}

export function useLocalConfig(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

export function Header({ title, subtitle, badge, onHome }) {
  return (
    <div className="header">
      <div className="logo" onClick={onHome} title="Back to home">{"\u03A9"}</div>
      <div className="header-text">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="header-nav">
        {onHome && (
          <button className="btn btn-ghost" onClick={onHome}>
            <Icon name="back" /> Home
          </button>
        )}
        <div className="header-badge">{badge || "v1.0 \u00B7 Internal"}</div>
      </div>
    </div>
  );
}

export function ContentfulCredsCard({ config, setConfig, extraFields = null }) {
  return (
    <div className="card">
      <div className="card-title"><span className="dot" />Contentful Credentials</div>
      <div className="field-row">
        <div>
          <label>SPACE ID</label>
          <input type="text" placeholder="e.g. xz1a2b3c4d5e"
            value={config.spaceId || ""}
            onChange={e => setConfig(p => ({ ...p, spaceId: e.target.value }))} />
        </div>
        <div>
          <label>CDA TOKEN (read)</label>
          <input type="password" placeholder="Content Delivery API token"
            value={config.cdaToken || ""}
            onChange={e => setConfig(p => ({ ...p, cdaToken: e.target.value }))} />
        </div>
      </div>
      <div className="field-row">
        <div>
          <label>CMA TOKEN (write)</label>
          <input type="password" placeholder="Content Management API token"
            value={config.cmaToken || ""}
            onChange={e => setConfig(p => ({ ...p, cmaToken: e.target.value }))} />
        </div>
        <div>
          <label>ENVIRONMENT</label>
          <input type="text" placeholder="master"
            value={config.environment || ""}
            onChange={e => setConfig(p => ({ ...p, environment: e.target.value }))} />
        </div>
      </div>
      {extraFields}
    </div>
  );
}

export async function injectHeadSnippet({ spaceId, cmaToken, toolType, identifier, code }) {
  const res = await fetch(`${API_BASE}/contentful/inject-head`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spaceId, cmaToken, toolType, identifier, code })
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

export function contentfulEntryUrl(spaceId, entryId, environment) {
  if (!spaceId || !entryId) return null;
  return `https://app.contentful.com/spaces/${spaceId}/environments/${environment || "master"}/entries/${entryId}`;
}

// Reusable post-injection result card: clickable Contentful link + auto-validation.
// Props:
//   entries: [{ entryId, label?, expectedCode? }]  — one or many created entries
//   spaceId, cdaToken, environment                 — for validation + URL
//   onClose?: () => void
export function InjectionResultCard({ entries = [], spaceId, cdaToken, environment, onClose }) {
  const [validations, setValidations] = useState({});
  const [validating, setValidating] = useState({});

  async function validateOne(entryId, expectedCode) {
    setValidating(p => ({ ...p, [entryId]: true }));
    try {
      const qs = new URLSearchParams({
        spaceId, cdaToken: cdaToken || "", environment: environment || "master"
      });
      const r = await fetch(`${API_BASE}/contentful/entry/${entryId}?${qs.toString()}`);
      if (!r.ok) {
        setValidations(p => ({ ...p, [entryId]: {
          ok: false, published: false,
          message: "Entry NOT published. CDA cannot read drafts. Publish in Contentful to make live."
        }}));
        return;
      }
      const body = await r.json();
      const f = body.fields || {};
      const actualCode = f.code || f.scriptCode || f.jsonLd || "";
      let codeMatches = true;
      if (expectedCode) codeMatches = String(actualCode).trim() === String(expectedCode).trim();
      setValidations(p => ({ ...p, [entryId]: {
        ok: codeMatches, published: true, codeMatches,
        actualLen: actualCode.length,
        message: codeMatches
          ? `Verified — entry published${expectedCode ? " + content matches" : ""}`
          : `Published BUT content differs (${actualCode.length} chars actual)`
      }}));
    } catch (e) {
      setValidations(p => ({ ...p, [entryId]: { ok: false, message: e.message }}));
    } finally {
      setValidating(p => ({ ...p, [entryId]: false }));
    }
  }

  // Auto-validate once on mount when CDA available
  useEffect(() => {
    if (!cdaToken) return;
    for (const e of entries) {
      setTimeout(() => validateOne(e.entryId, e.expectedCode), 1200);
    }
  }, [entries.map(e => e.entryId).join("|")]); // eslint-disable-line

  if (!entries.length) return null;

  return (
    <div className="card" style={{ marginTop: 16, borderColor: "var(--success)" }}>
      <div className="card-title">
        <span className="dot" />Injection Result
        <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "var(--mono)", color: "var(--text2)" }}>
          {entries.length} {entries.length === 1 ? "entry" : "entries"} created
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {entries.map((e, idx) => {
          const url = contentfulEntryUrl(spaceId, e.entryId, environment);
          const v = validations[e.entryId];
          const vBusy = validating[e.entryId];
          return (
            <div key={e.entryId + idx} style={{ padding: 12, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Icon name="check" />
                <strong style={{ color: "#E8EDF5", fontSize: 13 }}>{e.label || "Entry created"}</strong>
                <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
                  {e.entryId}
                </span>
              </div>
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="btn btn-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", fontSize: 12, padding: "6px 12px" }}>
                <Icon name="arrow" /> Open in Contentful
              </a>
              <div style={{ marginTop: 6, fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)", wordBreak: "break-all" }}>
                {url}
              </div>
              {cdaToken && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <button className="copy-btn" onClick={() => validateOne(e.entryId, e.expectedCode)} disabled={vBusy}>
                    {vBusy ? "Validating..." : v ? "Re-validate" : "Validate"}
                  </button>
                  {v && (
                    <span style={{ fontSize: 11, color: v.ok ? "var(--ok, #4ade80)" : "var(--warn)" }}>
                      {v.ok ? "✓" : "⚠"} {v.message}
                    </span>
                  )}
                </div>
              )}
              {v && !v.published && url && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text2)", lineHeight: 1.5, padding: 8, background: "rgba(255,181,71,0.06)", borderRadius: 4 }}>
                  <strong>Fix:</strong> Open entry above → top-right click <strong>Publish</strong> in Contentful UI.
                </div>
              )}
            </div>
          );
        })}
      </div>
      {onClose && (
        <div style={{ marginTop: 12, textAlign: "right" }}>
          <button className="copy-btn" onClick={onClose}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
