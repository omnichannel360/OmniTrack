import { useState } from "react";
import { Header, Icon, ContentfulCredsCard, useLocalConfig, API_BASE } from "../shared.jsx";

export default function BootstrapTool({ onHome }) {
  const [config, setConfig] = useLocalConfig("omnitrack:bootstrap", {
    spaceId: "", cdaToken: "", cmaToken: "", environment: "master"
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  async function bootstrap() {
    setRunning(true);
    setErr("");
    setResult(null);
    try {
      const r = await fetch(`${API_BASE}/contentful/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceId: config.spaceId,
          cmaToken: config.cmaToken,
          environment: config.environment || "master"
        })
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setResult(body);
    } catch (e) {
      setErr(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="app">
      <Header title="Bootstrap Contentful" subtitle="One-click setup of required content models" onHome={onHome} />
      <p className="phase-title">Auto-create Content Models</p>
      <p className="phase-sub">
        Creates (or upgrades) <code>headSnippet</code>, <code>seoSchema</code> and <code>dataLayerScript</code> in your Contentful space.
        Idempotent — safe to run multiple times. Requires a CMA token with <code>content_model:manage</code> scope.
      </p>

      <ContentfulCredsCard config={config} setConfig={setConfig} />

      <div className="card">
        <div className="card-title"><span className="dot" />What will be created</div>
        {[
          { id: "headSnippet", desc: "GA4 / GTM / GSC head & body snippets" },
          { id: "seoSchema", desc: "JSON-LD structured data entries" },
          { id: "dataLayerScript", desc: "Per-content-type dataLayer.push scripts" }
        ].map(m => (
          <div className="inject-row" key={m.id}>
            <div className="inject-info">
              <div className="inj-name">{m.id}</div>
              <div className="inj-status">{m.desc}</div>
            </div>
            <span className="badge badge-purple">Model</span>
          </div>
        ))}
      </div>

      {err && <div className="status-row error"><Icon name="x" /> {err}</div>}

      {result && (
        <div className="card">
          <div className="card-title">
            <span className="dot" />Bootstrap Result
            <span className="badge" style={{ marginLeft: "auto" }}>{result.environment}</span>
          </div>
          {result.results.map(r => (
            <div className="inject-row" key={r.id}>
              <div className="inject-info">
                <div className="inj-name">{r.id}</div>
                <div className="inj-status">
                  {r.error ? `Error: ${r.error}` :
                    r.skipped ? "Already existed \u2192 updated & published" :
                      r.created ? "Created & published" : "Unknown"}
                </div>
              </div>
              <span className={`badge ${r.error ? "badge-warn" : "badge-green"}`}>
                {r.error ? "Error" : r.published ? "Published" : "Saved"}
              </span>
            </div>
          ))}
          {result.success && (
            <div className="status-row success" style={{ marginTop: 12 }}>
              <Icon name="check" /> All content models ready. You can now use GA4 / GTM / GSC / Schema tools.
            </div>
          )}
        </div>
      )}

      <div className="actions">
        <button className="btn btn-ghost" onClick={onHome}><Icon name="back" /> Home</button>
        <div className="spacer" />
        <button className="btn btn-primary" disabled={!config.spaceId || !config.cmaToken || running} onClick={bootstrap}>
          {running ? <><span className="spinner" /> Bootstrapping...</> : <><Icon name="plug" /> Run Bootstrap</>}
        </button>
      </div>
    </div>
  );
}
