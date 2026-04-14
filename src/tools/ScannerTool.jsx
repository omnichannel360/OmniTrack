import { useState } from "react";
import { Header, Icon, ContentfulCredsCard, useLocalConfig, API_BASE } from "../shared.jsx";

export default function ScannerTool({ onHome }) {
  const [config, setConfig] = useLocalConfig("omnitrack:scanner", {
    spaceId: "", cdaToken: "", cmaToken: "", environment: "master"
  });
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  async function scan() {
    setScanning(true);
    setErr("");
    setResult(null);
    try {
      const r = await fetch(`${API_BASE}/contentful/scan-globals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceId: config.spaceId,
          cdaToken: config.cdaToken,
          environment: config.environment || "master"
        })
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setResult(body);
    } catch (e) {
      setErr(e.message);
    } finally {
      setScanning(false);
    }
  }

  const verdictBadge = (v) => {
    if (v === "strong") return <span className="badge badge-green">Strong match</span>;
    if (v === "possible") return <span className="badge badge-warn">Possible</span>;
    return <span className="badge">Weak</span>;
  };

  return (
    <div className="app">
      <Header title="Content Model Scanner" subtitle="One-click discovery of Contentful injection points" onHome={onHome} />
      <p className="phase-title">Scan Your Contentful Space</p>
      <p className="phase-sub">
        Analyzes all content types and fields in the space. Finds global/layout/settings models with
        fields like <code>headScripts</code>, <code>trackingCode</code>, <code>customHead</code>,
        <code>metaTags</code>, <code>schemaMarkup</code>, <code>jsonLd</code>. If found \u2192 you can inject directly
        with zero code changes to the Next.js frontend.
      </p>

      <ContentfulCredsCard config={config} setConfig={setConfig} />

      {err && <div className="status-row error"><Icon name="x" /> {err}</div>}

      <div className="actions">
        <button className="btn btn-ghost" onClick={onHome}><Icon name="back" /> Home</button>
        <div className="spacer" />
        <button className="btn btn-primary" disabled={!config.spaceId || !config.cdaToken || scanning} onClick={scan}>
          {scanning ? <><span className="spinner" /> Scanning...</> : <><Icon name="search" /> Scan Space</>}
        </button>
      </div>

      {result && (
        <>
          <div className={`status-row ${result.yoloPossible ? "success" : "warn"}`} style={{ marginTop: 16 }}>
            <Icon name={result.yoloPossible ? "check" : "x"} />
            {result.yoloPossible ? "YOLO \u2014 true zero-code injection is possible!" : "Manual step required"}
            <span style={{ marginLeft: "auto", opacity: 0.7 }}>{result.totalContentTypes} content types scanned</span>
          </div>

          <div className="card">
            <div className="card-title"><span className="dot" />Recommendation</div>
            <div style={{ fontSize: 13, color: "#E8EDF5", lineHeight: 1.6 }}>{result.recommendation}</div>
          </div>

          {result.topCandidate && (
            <div className="card">
              <div className="card-title">
                <span className="dot" />Top Injection Candidate
                {verdictBadge(result.topCandidate.verdict)}
              </div>
              <div className="inject-row">
                <div className="inject-info">
                  <div className="inj-name">{result.topCandidate.name}</div>
                  <div className="inj-status">{result.topCandidate.contentTypeId} {"\u00B7"} {result.topCandidate.totalFields} fields {"\u00B7"} score {result.topCandidate.score}</div>
                </div>
                <span className="badge badge-blue">{result.topCandidate.matchedFields.length} match</span>
              </div>
              {result.topCandidate.matchedFields.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--text2)", fontFamily: "var(--mono)", marginBottom: 8 }}>INJECTABLE FIELDS:</div>
                  <div className="event-tags">
                    {result.topCandidate.matchedFields.map(f => (
                      <span className="event-tag" key={f.id}>{f.id} {"\u00B7"} {f.type}</span>
                    ))}
                  </div>
                </div>
              )}
              {result.sampleEntries.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
                  {result.sampleEntries.length} existing entry/entries: {result.sampleEntries.map(e => e.id).join(", ")}
                </div>
              )}
            </div>
          )}

          {result.candidates.length > 0 && (
            <div className="card">
              <div className="card-title"><span className="dot" />All Candidates ({result.candidates.length})</div>
              {result.candidates.map(c => (
                <div className="inject-row" key={c.contentTypeId}>
                  <div className="inject-info">
                    <div className="inj-name">{c.name}</div>
                    <div className="inj-status">
                      {c.contentTypeId} {"\u00B7"} matched: {c.matchedFields.map(f => f.id).join(", ") || "(name only)"}
                    </div>
                  </div>
                  {verdictBadge(c.verdict)}
                </div>
              ))}
            </div>
          )}

          {!result.yoloPossible && (
            <div className="card">
              <div className="card-title"><span className="dot" />Next Steps</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)" }}>
                <p>No global/tracking/settings content type with injectable Text fields was found. You have two options:</p>
                <br />
                <p><strong style={{color:"var(--accent)"}}>Option A \u2014 One-file Next.js drop (recommended):</strong><br />
                Use the <strong>Next.js Integration</strong> tool to generate <code>OmniTrackInjector.tsx</code>. Have a dev drop it into Credo's Next.js repo once (~2 min). After that, everything you inject here appears on the live site automatically.</p>
                <br />
                <p><strong style={{color:"var(--accent)"}}>Option B \u2014 Add a SiteSettings model:</strong><br />
                Bootstrap tool can create a <code>siteSettings</code> singleton model with fields for tracking scripts. But Next.js still needs to read it once \u2014 so Option A is strictly better.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
