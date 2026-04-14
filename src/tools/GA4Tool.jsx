import { useState } from "react";
import { Header, Icon, ContentfulCredsCard, useLocalConfig, injectHeadSnippet } from "../shared.jsx";

function buildGA4Snippet(id) {
  return `<!-- Google tag (gtag.js) - GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${id}', { anonymize_ip: true, allow_google_signals: false });
</script>`;
}

export default function GA4Tool({ onHome }) {
  const [config, setConfig] = useLocalConfig("omnitrack:ga4", {
    spaceId: "", cdaToken: "", cmaToken: "", environment: "master",
    measurementId: "", anonymizeIp: true
  });
  const [injecting, setInjecting] = useState(false);
  const [status, setStatus] = useState(null);

  const validId = /^G-[A-Z0-9]{4,}$/i.test(config.measurementId);
  const snippet = validId ? buildGA4Snippet(config.measurementId) : "";

  async function handleInject() {
    setInjecting(true);
    setStatus(null);
    try {
      if (!config.spaceId || !config.cmaToken) {
        setStatus({ type: "warn", msg: "Missing Contentful CMA credentials \u2014 snippet previewed only (no inject)." });
      } else {
        const r = await injectHeadSnippet({
          spaceId: config.spaceId, cmaToken: config.cmaToken,
          toolType: "ga4", identifier: config.measurementId, code: snippet
        });
        setStatus(r.ok
          ? { type: "success", msg: `Injected GA4 snippet as headSnippet entry ${r.body.entryId || ""}` }
          : { type: "error", msg: `CMA error ${r.status}: ${r.body.error || "unknown"}` });
      }
    } catch (e) {
      setStatus({ type: "error", msg: e.message });
    } finally {
      setInjecting(false);
    }
  }

  return (
    <div className="app">
      <Header title="GA4 Injection" subtitle="Google Analytics 4 \u00B7 gtag.js head snippet" onHome={onHome} />
      <p className="phase-title">Inject GA4 Measurement Script</p>
      <p className="phase-sub">Provide your GA4 Measurement ID and Contentful CMA credentials. The snippet will be created as a <code>headSnippet</code> entry tagged <code>ga4</code> that your CMS layout consumes in the head region.</p>

      <ContentfulCredsCard config={config} setConfig={setConfig} />

      <div className="card">
        <div className="card-title"><span className="dot" />GA4 Configuration</div>
        <div className="field-row">
          <div>
            <label>MEASUREMENT ID</label>
            <input type="text" placeholder="G-XXXXXXXXXX"
              value={config.measurementId}
              onChange={e => setConfig(p => ({ ...p, measurementId: e.target.value.trim() }))} />
          </div>
          <div>
            <label>ANONYMIZE IP</label>
            <select value={config.anonymizeIp ? "yes" : "no"}
              onChange={e => setConfig(p => ({ ...p, anonymizeIp: e.target.value === "yes" }))}>
              <option value="yes">Yes (GDPR-safe)</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        {!validId && config.measurementId && (
          <div className="status-row warn"><Icon name="x" /> Measurement ID must match <code>G-XXXXXXXXXX</code></div>
        )}
      </div>

      {snippet && (
        <div className="card">
          <div className="card-title"><span className="dot" />Generated Snippet</div>
          <div className="script-block">
            <div className="script-header">
              <div className="script-label"><strong>gtag.js</strong> {"\u00B7"} {config.measurementId}</div>
              <button className="copy-btn" onClick={() => navigator.clipboard.writeText(snippet)}>
                <Icon name="copy" /> Copy
              </button>
            </div>
            <pre>{snippet}</pre>
          </div>
        </div>
      )}

      {status && <div className={`status-row ${status.type}`}><Icon name={status.type === "success" ? "check" : "x"} /> {status.msg}</div>}

      <div className="actions">
        <button className="btn btn-ghost" onClick={onHome}><Icon name="back" /> Home</button>
        <div className="spacer" />
        <button className="btn btn-primary" disabled={!validId || injecting} onClick={handleInject}>
          {injecting ? <><span className="spinner" /> Injecting...</> : <><Icon name="inject" /> Inject to CMS</>}
        </button>
      </div>
    </div>
  );
}
