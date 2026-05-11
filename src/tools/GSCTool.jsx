import { useState, useEffect } from "react";
import { Header, Icon, ContentfulCredsCard, useLocalConfig, injectHeadSnippet, InjectionResultCard } from "../shared.jsx";

// Extract verification token from whatever user pasted: raw token, full meta tag,
// HTML-encoded tag, or just attribute fragment. Returns the clean token only.
function extractGSCToken(input) {
  if (!input) return { token: "", warning: null };
  let raw = String(input).trim();

  // Strip surrounding code fences / quotes
  raw = raw.replace(/^[`'"]+|[`'"]+$/g, "").trim();

  // Decode HTML entities (handles &quot; etc.)
  const decoded = raw
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

  // Try to extract content="..." attribute (multiple possible variants)
  const metaMatch = decoded.match(/<meta[^>]*name\s*=\s*["']?google-site-verification["']?[^>]*content\s*=\s*["']([^"'>]+)["']/i)
    || decoded.match(/<meta[^>]*content\s*=\s*["']([^"'>]+)["'][^>]*name\s*=\s*["']?google-site-verification["']?/i)
    || decoded.match(/content\s*=\s*["']([^"'>]+)["']/i);

  let token;
  let warning = null;

  if (metaMatch) {
    token = metaMatch[1].trim();
    if (decoded !== token) {
      warning = "Auto-extracted token from meta tag. Tool wraps it in <meta> on inject.";
    }
  } else {
    // Treat input as raw token. Strip any HTML/whitespace.
    token = decoded.replace(/[<>"']/g, "").trim();
  }

  // Final safety: if token still looks like nested HTML, reject
  if (/<meta|content=/i.test(token)) {
    warning = "Token still contains HTML markup. Paste only the alphanumeric value from GSC.";
  }

  return { token, warning };
}

function buildGSCMeta(code) {
  const safe = (code || "").replace(/"/g, "&quot;");
  return `<meta name="google-site-verification" content="${safe}" />`;
}

export default function GSCTool({ onHome }) {
  // Only persist credentials. Verification code + domain are session-only (don't survive reload).
  const [config, setConfig] = useLocalConfig("omnitrack:gsc", {
    spaceId: "", cdaToken: "", cmaToken: "", environment: "master"
  });
  const [verificationCode, setVerificationCode] = useState("");
  const [domain, setDomain] = useState("");

  // Migration: strip old verificationCode + domain from localStorage if persisted from previous version
  useEffect(() => {
    try {
      const raw = localStorage.getItem("omnitrack:gsc");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.verificationCode || parsed.domain) {
        delete parsed.verificationCode;
        delete parsed.domain;
        localStorage.setItem("omnitrack:gsc", JSON.stringify(parsed));
      }
    } catch {}
  }, []);
  const [injecting, setInjecting] = useState(false);
  const [status, setStatus] = useState(null);
  const [injectedEntries, setInjectedEntries] = useState([]);

  const { token: cleanToken, warning: extractWarning } = extractGSCToken(verificationCode);
  const valid = cleanToken && cleanToken.length >= 20 && !/[<>]/.test(cleanToken);
  const snippet = valid ? buildGSCMeta(cleanToken) : "";

  function clearGSCForm() {
    setVerificationCode("");
    setDomain("");
    setStatus(null);
    setInjectedEntries([]);
  }

  async function handleInject() {
    setInjecting(true);
    setStatus(null);
    setInjectedEntries([]);
    try {
      if (!config.spaceId || !config.cmaToken) {
        setStatus({ type: "warn", msg: "Missing CMA credentials \u2014 snippet previewed only." });
      } else {
        const r = await injectHeadSnippet({
          spaceId: config.spaceId, cmaToken: config.cmaToken,
          toolType: "gsc", identifier: domain || cleanToken.slice(0, 12), code: snippet
        });
        if (r.ok) {
          setStatus({ type: "success", msg: "GSC meta tag injected" });
          setInjectedEntries([{ entryId: r.body.entryId, label: "GSC Verification Meta Tag", expectedCode: snippet }]);
        } else {
          setStatus({ type: "error", msg: `CMA error ${r.status}: ${r.body.error || "unknown"}` });
        }
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
        <div className="card-title">
          <span className="dot" />GSC Configuration
          {(verificationCode || domain) && (
            <button className="copy-btn" onClick={clearGSCForm} style={{ marginLeft: "auto" }}>
              <Icon name="x" /> Clear
            </button>
          )}
        </div>
        <div className="field-row">
          <div>
            <label>DOMAIN (optional)</label>
            <input type="text" placeholder="example.com"
              value={domain}
              onChange={e => setDomain(e.target.value.trim())} />
          </div>
          <div>
            <label>VERIFICATION CONTENT VALUE (or paste full meta tag)</label>
            <input type="text" placeholder="abc123...xyz OR <meta name=... />"
              value={verificationCode}
              onChange={e => setVerificationCode(e.target.value)} />
          </div>
        </div>
        {cleanToken && (
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--text2)", fontFamily: "var(--mono)" }}>
            Extracted token: <code style={{ color: valid ? "var(--ok, #4ade80)" : "var(--danger)" }}>{cleanToken.slice(0, 50)}{cleanToken.length > 50 ? "..." : ""}</code>
            <span style={{ marginLeft: 8, opacity: 0.6 }}>({cleanToken.length} chars)</span>
          </div>
        )}
        {extractWarning && (
          <div className="status-row warn" style={{ marginTop: 8 }}>
            <Icon name="warn" /> {extractWarning}
          </div>
        )}
        {!valid && verificationCode && !extractWarning && (
          <div className="status-row warn"><Icon name="x" /> Verification code looks too short or contains markup. Expected ~43 alphanumeric chars.</div>
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

      {status && (
        <div className={`status-row ${status.type}`}>
          <Icon name={status.type === "success" ? "check" : "x"} /> {status.msg}
        </div>
      )}

      <InjectionResultCard
        entries={injectedEntries}
        spaceId={config.spaceId}
        cdaToken={config.cdaToken}
        environment={config.environment}
      />


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
