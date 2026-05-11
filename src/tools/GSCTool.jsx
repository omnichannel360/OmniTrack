import { useState } from "react";
import { Header, Icon, ContentfulCredsCard, useLocalConfig, injectHeadSnippet, API_BASE } from "../shared.jsx";

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
  const [config, setConfig] = useLocalConfig("omnitrack:gsc", {
    spaceId: "", cdaToken: "", cmaToken: "", environment: "master",
    verificationCode: "", domain: ""
  });
  const [injecting, setInjecting] = useState(false);
  const [status, setStatus] = useState(null);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);

  function contentfulEntryUrl(entryId) {
    if (!config.spaceId || !entryId) return null;
    return `https://app.contentful.com/spaces/${config.spaceId}/environments/${config.environment || "master"}/entries/${entryId}`;
  }

  async function validateEntry(entryId) {
    setValidating(true);
    try {
      const qs = new URLSearchParams({
        spaceId: config.spaceId,
        cdaToken: config.cdaToken || "",
        environment: config.environment || "master"
      });
      const r = await fetch(`${API_BASE}/contentful/entry/${entryId}?${qs.toString()}`);
      const body = await r.json();
      if (!r.ok) {
        // Likely entry is draft (CDA only returns published)
        setValidation({
          ok: false,
          published: false,
          message: "Entry created but NOT published. CDA cannot read it until you publish in Contentful."
        });
        return;
      }
      const code = body.fields?.code || "";
      const matches = code.trim() === snippet.trim();
      setValidation({
        ok: matches,
        published: true,
        codeMatches: matches,
        actualCode: code,
        message: matches
          ? "Verified — entry published + content matches generated snippet"
          : "Entry published BUT content does not match expected snippet"
      });
    } catch (e) {
      setValidation({ ok: false, message: e.message });
    } finally {
      setValidating(false);
    }
  }

  const { token: cleanToken, warning: extractWarning } = extractGSCToken(config.verificationCode);
  const valid = cleanToken && cleanToken.length >= 20 && !/[<>]/.test(cleanToken);
  const snippet = valid ? buildGSCMeta(cleanToken) : "";

  async function handleInject() {
    setInjecting(true);
    setStatus(null);
    setValidation(null);
    try {
      if (!config.spaceId || !config.cmaToken) {
        setStatus({ type: "warn", msg: "Missing CMA credentials \u2014 snippet previewed only." });
      } else {
        const r = await injectHeadSnippet({
          spaceId: config.spaceId, cmaToken: config.cmaToken,
          toolType: "gsc", identifier: config.domain || cleanToken.slice(0, 12), code: snippet
        });
        if (r.ok) {
          setStatus({ type: "success", msg: "GSC meta tag injected", entryId: r.body.entryId });
          // Auto-validate after injection if CDA token present
          if (config.cdaToken) {
            setTimeout(() => validateEntry(r.body.entryId), 1500);
          }
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
        <div className="card-title"><span className="dot" />GSC Configuration</div>
        <div className="field-row">
          <div>
            <label>DOMAIN (optional)</label>
            <input type="text" placeholder="example.com"
              value={config.domain}
              onChange={e => setConfig(p => ({ ...p, domain: e.target.value.trim() }))} />
          </div>
          <div>
            <label>VERIFICATION CONTENT VALUE (or paste full meta tag)</label>
            <input type="text" placeholder="abc123...xyz OR <meta name=... />"
              value={config.verificationCode}
              onChange={e => setConfig(p => ({ ...p, verificationCode: e.target.value }))} />
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
        {!valid && config.verificationCode && !extractWarning && (
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
        <div className="card" style={{ marginTop: 16, borderColor: status.type === "success" ? "var(--success)" : status.type === "error" ? "var(--danger)" : "var(--warn)" }}>
          <div className={`status-row ${status.type}`}>
            <Icon name={status.type === "success" ? "check" : "x"} /> {status.msg}
            {status.entryId && (
              <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, opacity: 0.7 }}>
                entry: {status.entryId}
              </span>
            )}
          </div>
          {status.entryId && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <a
                href={contentfulEntryUrl(status.entryId)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", justifyContent: "center" }}
              >
                <Icon name="arrow" /> Open entry in Contentful
              </a>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)", wordBreak: "break-all" }}>
                {contentfulEntryUrl(status.entryId)}
              </div>
              {config.cdaToken && (
                <button
                  className="btn btn-ghost"
                  onClick={() => validateEntry(status.entryId)}
                  disabled={validating}
                  style={{ fontSize: 12 }}
                >
                  {validating ? <><span className="spinner" /> Validating...</> : <><Icon name="refresh" /> Re-validate via CDA</>}
                </button>
              )}
              {validation && (
                <div className={`status-row ${validation.ok ? "success" : "warn"}`} style={{ marginTop: 4 }}>
                  <Icon name={validation.ok ? "check" : "warn"} /> {validation.message}
                </div>
              )}
              {validation && !validation.published && (
                <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.5, padding: 10, background: "rgba(255,181,71,0.06)", borderRadius: 4 }}>
                  <strong>Fix:</strong> Open entry in Contentful (link above) → top-right click <strong>Publish</strong>. CDA + Credo's Next.js cannot read draft entries.
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
