import { useState } from "react";
import { Header, Icon, ContentfulCredsCard, useLocalConfig, injectHeadSnippet } from "../shared.jsx";

function buildGTMHead(id) {
  return `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');</script>
<!-- End Google Tag Manager -->`;
}

function buildGTMBody(id) {
  return `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;
}

export default function GTMTool({ onHome }) {
  const [config, setConfig] = useLocalConfig("omnitrack:gtm", {
    spaceId: "", cdaToken: "", cmaToken: "", environment: "master",
    containerId: ""
  });
  const [injecting, setInjecting] = useState(false);
  const [log, setLog] = useState([]);

  const valid = /^GTM-[A-Z0-9]{5,}$/i.test(config.containerId);
  const head = valid ? buildGTMHead(config.containerId) : "";
  const body = valid ? buildGTMBody(config.containerId) : "";

  async function handleInject() {
    setInjecting(true);
    setLog([]);
    const push = (type, msg) => setLog(l => [...l, { type, msg, ts: Date.now() }]);

    if (!config.spaceId || !config.cmaToken) {
      push("info", "No CMA credentials \u2014 snippets generated locally only.");
      setInjecting(false);
      return;
    }
    try {
      push("accent", "Injecting GTM head snippet...");
      const r1 = await injectHeadSnippet({
        spaceId: config.spaceId, cmaToken: config.cmaToken,
        toolType: "gtm-head", identifier: config.containerId, code: head
      });
      push(r1.ok ? "ok" : "err", r1.ok ? `\u2713 Head snippet injected (${r1.body.entryId})` : `\u2717 Head error ${r1.status}`);

      push("accent", "Injecting GTM body noscript snippet...");
      const r2 = await injectHeadSnippet({
        spaceId: config.spaceId, cmaToken: config.cmaToken,
        toolType: "gtm-body", identifier: config.containerId, code: body
      });
      push(r2.ok ? "ok" : "err", r2.ok ? `\u2713 Body snippet injected (${r2.body.entryId})` : `\u2717 Body error ${r2.status}`);
    } catch (e) {
      push("err", e.message);
    } finally {
      setInjecting(false);
    }
  }

  return (
    <div className="app">
      <Header title="GTM Injection" subtitle="Google Tag Manager \u00B7 head + noscript body" onHome={onHome} />
      <p className="phase-title">Inject GTM Container</p>
      <p className="phase-sub">Provide your GTM container ID. Two <code>headSnippet</code> entries are created (one for head, one for body noscript) so your CMS layout can render both in the correct regions.</p>

      <ContentfulCredsCard config={config} setConfig={setConfig} />

      <div className="card">
        <div className="card-title"><span className="dot" />GTM Configuration</div>
        <label>CONTAINER ID</label>
        <input type="text" placeholder="GTM-XXXXXXX"
          value={config.containerId}
          onChange={e => setConfig(p => ({ ...p, containerId: e.target.value.trim() }))} />
        {!valid && config.containerId && (
          <div className="status-row warn"><Icon name="x" /> Must match <code>GTM-XXXXXXX</code></div>
        )}
      </div>

      {valid && (
        <>
          <div className="card">
            <div className="card-title"><span className="dot" />Head Snippet</div>
            <div className="script-block">
              <div className="script-header">
                <div className="script-label"><strong>gtm.js</strong> {"\u00B7"} head</div>
                <button className="copy-btn" onClick={() => navigator.clipboard.writeText(head)}><Icon name="copy" /> Copy</button>
              </div>
              <pre>{head}</pre>
            </div>
          </div>
          <div className="card">
            <div className="card-title"><span className="dot" />Body Snippet (noscript)</div>
            <div className="script-block">
              <div className="script-header">
                <div className="script-label"><strong>ns.html</strong> {"\u00B7"} body first child</div>
                <button className="copy-btn" onClick={() => navigator.clipboard.writeText(body)}><Icon name="copy" /> Copy</button>
              </div>
              <pre>{body}</pre>
            </div>
          </div>
        </>
      )}

      {log.length > 0 && (
        <div className="log-console">
          {log.map((l, i) => (
            <div key={i} className={`log-line ${l.type}`}>[{new Date(l.ts).toLocaleTimeString()}] {l.msg}</div>
          ))}
        </div>
      )}

      <div className="actions">
        <button className="btn btn-ghost" onClick={onHome}><Icon name="back" /> Home</button>
        <div className="spacer" />
        <button className="btn btn-primary" disabled={!valid || injecting} onClick={handleInject}>
          {injecting ? <><span className="spinner" /> Injecting...</> : <><Icon name="inject" /> Inject Both Snippets</>}
        </button>
      </div>
    </div>
  );
}
