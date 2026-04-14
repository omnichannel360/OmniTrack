import { useState, useEffect } from "react";

export const API_BASE = "/api";

export function Icon({ name, size = 14 }) {
  const icons = {
    check: "\u2713", x: "\u2717", dot: "\u25CF", arrow: "\u2192", copy: "\u29C7",
    plug: "\u26A1", code: "</>", inject: "\u2B95", download: "\u2B07", refresh: "\u27BA",
    back: "\u2190", home: "\u2302", search: "\u2315", tag: "\u25B6"
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
