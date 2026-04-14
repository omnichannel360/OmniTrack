import { useState } from "react";
import { Header, Icon, ContentfulCredsCard, useLocalConfig, API_BASE } from "../shared.jsx";

const SCHEMA_TYPE_MAP = {
  blogPost: "Article", article: "Article", post: "Article",
  productPage: "Product", product: "Product",
  planPage: "Product", promoPage: "Offer", offer: "Offer",
  landingPage: "WebPage", homePage: "WebPage", page: "WebPage",
  formPage: "ContactPage", contact: "ContactPage",
  organization: "Organization", company: "Organization",
  faq: "FAQPage", event: "Event", recipe: "Recipe",
  person: "Person", author: "Person"
};

function detectSchemaType(ct) {
  const id = (ct?.sys?.id || "").toLowerCase();
  return SCHEMA_TYPE_MAP[id] || SCHEMA_TYPE_MAP[Object.keys(SCHEMA_TYPE_MAP).find(k => id.includes(k.toLowerCase()))] || "WebPage";
}

function pickField(entry, ...candidates) {
  const f = entry.fields || {};
  for (const name of candidates) {
    const val = f[name];
    if (val == null) continue;
    if (typeof val === "string" && val.trim()) return val.trim();
    if (typeof val === "number") return val;
    if (typeof val === "object" && val["en-US"]) return val["en-US"];
  }
  return null;
}

function analyzeAndBuildJsonLd(entry, ct) {
  const schemaType = detectSchemaType(ct);
  const name = pickField(entry, "name", "title", "planName", "deviceName", "promoTitle", "headline");
  const description = pickField(entry, "description", "summary", "excerpt", "subtitle");
  const image = pickField(entry, "image", "heroImage", "featuredImage");
  const slug = pickField(entry, "slug", "url", "path");
  const price = pickField(entry, "price", "amount");
  const author = pickField(entry, "author", "writer");
  const datePublished = pickField(entry, "publishDate", "publishedAt", "date")
    || entry?.sys?.createdAt || null;

  const base = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: name || ct?.name || "Untitled",
  };
  if (description) base.description = String(description).slice(0, 500);
  if (slug) base.url = slug.startsWith("http") ? slug : `/${String(slug).replace(/^\//, "")}`;
  if (image) base.image = typeof image === "string" ? image : undefined;

  if (schemaType === "Product" || schemaType === "Offer") {
    if (price != null) {
      base.offers = {
        "@type": "Offer",
        price: String(price),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock"
      };
    }
  }
  if (schemaType === "Article") {
    if (author) base.author = { "@type": "Person", name: String(author) };
    if (datePublished) base.datePublished = datePublished;
  }
  return base;
}

export default function SchemaTool({ onHome }) {
  const [config, setConfig] = useLocalConfig("omnitrack:schema", {
    spaceId: "", cdaToken: "", cmaToken: "", environment: "master"
  });
  const [loading, setLoading] = useState(false);
  const [contentTypes, setContentTypes] = useState([]);
  const [selectedCt, setSelectedCt] = useState(null);
  const [entries, setEntries] = useState([]);
  const [analyzed, setAnalyzed] = useState([]);
  const [err, setErr] = useState("");
  const [injecting, setInjecting] = useState(false);
  const [log, setLog] = useState([]);

  async function loadContentTypes() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/contentful/content-types?spaceId=${encodeURIComponent(config.spaceId)}&cdaToken=${encodeURIComponent(config.cdaToken)}`);
      if (!r.ok) throw new Error(`CDA error ${r.status}`);
      const d = await r.json();
      setContentTypes(d.items || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadEntries(ct) {
    setSelectedCt(ct);
    setEntries([]);
    setAnalyzed([]);
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/contentful/entries?spaceId=${encodeURIComponent(config.spaceId)}&cdaToken=${encodeURIComponent(config.cdaToken)}&contentTypeId=${encodeURIComponent(ct.sys.id)}&limit=25`);
      if (!r.ok) throw new Error(`CDA error ${r.status}`);
      const d = await r.json();
      setEntries(d.items || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function analyze() {
    if (!selectedCt) return;
    const results = entries.map(entry => ({
      entry,
      jsonLd: analyzeAndBuildJsonLd(entry, selectedCt),
      schemaType: detectSchemaType(selectedCt)
    }));
    setAnalyzed(results);
  }

  async function injectAll() {
    if (!config.cmaToken) {
      setLog([{ type: "err", msg: "CMA token required to inject schema", ts: Date.now() }]);
      return;
    }
    setInjecting(true);
    setLog([]);
    const push = (type, msg) => setLog(l => [...l, { type, msg, ts: Date.now() }]);
    for (const a of analyzed) {
      const entryId = a.entry.sys.id;
      push("accent", `Injecting schema for ${entryId} (${a.schemaType})`);
      try {
        const r = await fetch(`${API_BASE}/contentful/inject-schema`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spaceId: config.spaceId, cmaToken: config.cmaToken,
            entryId, contentTypeId: selectedCt.sys.id,
            schemaType: a.schemaType, jsonLd: a.jsonLd
          })
        });
        const body = await r.json().catch(() => ({}));
        push(r.ok ? "ok" : "err", r.ok ? `\u2713 ${entryId} \u2192 ${body.entryId}` : `\u2717 ${entryId} \u2014 ${body.error || r.status}`);
      } catch (e) {
        push("err", `${entryId} \u2014 ${e.message}`);
      }
    }
    push("accent", "Done.");
    setInjecting(false);
  }

  return (
    <div className="app">
      <Header title="Schema Generator" subtitle="Contentful \u2192 analyze \u2192 JSON-LD \u2192 inject back" onHome={onHome} />
      <p className="phase-title">Generate & Inject Structured Data</p>
      <p className="phase-sub">Pull entries from Contentful, analyze each one to generate a JSON-LD schema appropriate to the content type, and inject the schema back as <code>seoSchema</code> entries linked to the source.</p>

      <ContentfulCredsCard config={config} setConfig={setConfig} />

      <div className="actions">
        <button className="btn btn-primary" disabled={!config.spaceId || !config.cdaToken || loading} onClick={loadContentTypes}>
          {loading ? <><span className="spinner" /> Loading...</> : <><Icon name="plug" /> Load Content Types</>}
        </button>
      </div>

      {err && <div className="status-row error"><Icon name="x" /> {err}</div>}

      {contentTypes.length > 0 && (
        <div className="card">
          <div className="card-title"><span className="dot" />Content Types ({contentTypes.length})</div>
          <div className="content-type-grid">
            {contentTypes.map(ct => (
              <div key={ct.sys.id}
                className={`ct-card ${selectedCt?.sys.id === ct.sys.id ? "selected" : ""}`}
                onClick={() => loadEntries(ct)}>
                <div className="ct-check">{selectedCt?.sys.id === ct.sys.id ? "\u2713" : ""}</div>
                <div className="ct-name">{ct.name}</div>
                <div className="ct-id">{ct.sys.id}</div>
                <div className="ct-fields">
                  {ct.fields?.length || 0} fields {"\u00B7"} schema: <strong style={{color:"#A78BFA"}}>{detectSchemaType(ct)}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedCt && (
        <div className="card">
          <div className="card-title">
            <span className="dot" />Entries for {selectedCt.name} ({entries.length})
          </div>
          {entries.length === 0 && !loading && (
            <div className="empty-state">No entries returned.</div>
          )}
          {entries.length > 0 && (
            <>
              <div className="entry-list">
                {entries.slice(0, 10).map(e => (
                  <div key={e.sys.id} className="entry-row">
                    <div>
                      <div className="entry-title">{String(pickField(e, "name", "title", "headline") || "(untitled)")}</div>
                      <div className="entry-id">{e.sys.id}</div>
                    </div>
                    <span className="badge badge-purple">{detectSchemaType(selectedCt)}</span>
                  </div>
                ))}
                {entries.length > 10 && (
                  <div className="entry-row"><div className="entry-id">+ {entries.length - 10} more {"\u2026"}</div></div>
                )}
              </div>
              <div className="actions">
                <button className="btn btn-primary" onClick={analyze}><Icon name="code" /> Analyze & Build JSON-LD</button>
              </div>
            </>
          )}
        </div>
      )}

      {analyzed.length > 0 && (
        <div className="card">
          <div className="card-title">
            <span className="dot" />Generated JSON-LD ({analyzed.length})
            <button className="copy-btn" style={{ marginLeft: "auto" }}
              onClick={() => navigator.clipboard.writeText(analyzed.map(a => JSON.stringify(a.jsonLd, null, 2)).join("\n\n"))}>
              <Icon name="copy" /> Copy All
            </button>
          </div>
          {analyzed.slice(0, 5).map((a, i) => (
            <div className="script-block" key={i}>
              <div className="script-header">
                <div className="script-label"><strong>{a.schemaType}</strong> {"\u00B7"} {a.entry.sys.id}</div>
                <button className="copy-btn" onClick={() => navigator.clipboard.writeText(JSON.stringify(a.jsonLd, null, 2))}><Icon name="copy" /> Copy</button>
              </div>
              <pre>{JSON.stringify(a.jsonLd, null, 2)}</pre>
            </div>
          ))}
          {analyzed.length > 5 && (
            <div className="empty-state">+ {analyzed.length - 5} more schemas prepared</div>
          )}
        </div>
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
        {analyzed.length > 0 && (
          <button className="btn btn-primary" disabled={injecting} onClick={injectAll}>
            {injecting ? <><span className="spinner" /> Injecting...</> : <><Icon name="inject" /> Inject {analyzed.length} Schemas</>}
          </button>
        )}
      </div>
    </div>
  );
}
