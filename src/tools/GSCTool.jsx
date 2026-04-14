import { useState } from "react";
import { Header, Icon, ContentfulCredsCard, useLocalConfig, injectHeadSnippet } from "../shared.jsx";

function buildGSCMeta(code) {
  const safe = (code || "").replace(/"/g, "&quot;");
  return `<meta name="google-site-verification" content="${safe}" />`;
}

export default function GSCTool({ onHome }) {
  const [config, setConfig] = useLocalConfig("omnitrack:gsc", {
    spaceId: "", cdaToken: "", cmaToken: "", environment: "master",
    verificationCode: "", domain: ""
  });
  const [injecting, setInjecting] = useState(false);
  const [status, setStatus] = useState(null);

  const valid = config.verificationCode && config.verificationCode.length >= 20;
  const snippet = valid ? buildGSCMeta(config.verificationCode) : "";

  async function handleInject() {
    setInjecting(true);
    setStatus(null);
    try {
      if (!config.spaceId || !config.cmaToken) {
        setStatus({ type: "warn", msg: "Missing CMA credentials \u2014 snippet previewed only." });
      } else {
        const r = await injectHeadSnippet({
          spaceId: config.spaceId, cmaToken: config.cmaToken,
          toolType: "gsc", identifier: config.domain || config.verificationCode.slice(0, 12), code: snippet
        });
        setStatus(r.ok
          ? { type: "success", msg: `GSC meta tag injected (entry ${r.body.entryId})` }
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
      <Header title="GSC Verification" subtitle="Google Search Console \u00B7 site ownership meta tag" onHome={onHome} />
      <p className="phase-title">Inject GSC Verification</p>
      <p className="phase-sub">Paste the HTML tag verification <strong>content</strong> value from Search Console. A meta tag is created as a <code>headSnippet</code> entry that your CMS places in the site head.</p>

      <ContentfulCredsCard config={config} setConfig={setConfig} />

      <div className="card">
        <div className="card-title"><span className="dot" />GSC Configuration</div>
        <div className="field-row">
          <div>
            <label>DOMAIN (optional)</label>
            <input type="text" placeholder="example.com"
              value={config.domain}
              onChange={e => setConfig(p => ({ ...p, domain: e.target.value.trim() }))} />
          </div>
          <div>
            <label>VERIFICATION CONTENT VALUE</label>
            <input type="text" placeholder="abc123...xyz"
              value={config.verificationCode}
              onChange={e => setConfig(p => ({ ...p, verificationCode: e.target.value.trim() }))} />
          </div>
        </div>
        {!valid && config.verificationCode && (
          <div className="status-row warn"><Icon name="x" /> Verification code looks too short.</div>
        )}
      </div>

      {snippet && (
        <div className="card">
          <div className="card-title"><span className="dot" />Generated Meta Tag</div>
          <div className="script-block">
            <div className="script-header">
              <div className="script-label"><strong>google-site-verification</strong> {"\u00B7"} head</div>
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
        <button className="btn btn-primary" disabled={!valid || injecting} onClick={handleInject}>
          {injecting ? <><span className="spinner" /> Injecting...</> : <><Icon name="inject" /> Inject to CMS</>}
        </button>
      </div>
    </div>
  );
}
