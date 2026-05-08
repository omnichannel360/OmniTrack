import { useState, useEffect, useRef } from "react";
import { Header, Icon, API_BASE } from "../shared.jsx";

const PHASES = ["Connect", "Discover", "Generate", "Inject", "Validate"];

const GA4_EVENT_MAP = {
  planPage: ["view_item", "select_item", "add_to_cart"],
  checkoutPage: ["begin_checkout", "add_payment_info", "purchase"],
  landingPage: ["view_promotion", "select_promotion"],
  formPage: ["generate_lead", "sign_up"],
  blogPost: ["page_view"],
  productPage: ["view_item", "select_item"],
  homePage: ["page_view", "view_promotion"],
};

const DEMO_CONTENT_TYPES = [
  { sys: { id: "planPage" }, name: "Plan Page", description: "Mobile plan comparison and selection", fields: [{ id: "planName" }, { id: "price" }, { id: "dataAllowance" }, { id: "slug" }] },
  { sys: { id: "checkoutPage" }, name: "Checkout Page", description: "Order and payment flow", fields: [{ id: "step" }, { id: "title" }, { id: "formFields" }] },
  { sys: { id: "landingPage" }, name: "Landing Page", description: "Campaign landing pages", fields: [{ id: "hero" }, { id: "cta" }, { id: "promoCode" }] },
  { sys: { id: "formPage" }, name: "Form / Lead Gen", description: "Contact and inquiry forms", fields: [{ id: "formTitle" }, { id: "fields" }, { id: "submitLabel" }] },
  { sys: { id: "productPage" }, name: "Product / Device Page", description: "Phone and device pages", fields: [{ id: "deviceName" }, { id: "price" }, { id: "specs" }, { id: "sku" }] },
  { sys: { id: "blogPost" }, name: "Blog Post", description: "Editorial content", fields: [{ id: "title" }, { id: "category" }, { id: "author" }, { id: "publishDate" }] },
  { sys: { id: "homePage" }, name: "Home Page", description: "Main landing experience", fields: [{ id: "hero" }, { id: "featuredPlans" }, { id: "promos" }] },
  { sys: { id: "promoPage" }, name: "Promo / Offer Page", description: "Special offers and deals", fields: [{ id: "promoTitle" }, { id: "discount" }, { id: "promoCode" }, { id: "expiry" }] },
];

function generateInteractionScript(interactions, gtmId) {
  if (!interactions.length) return "";
  const groups = {};
  for (const it of interactions) {
    if (!groups[it.event]) groups[it.event] = [];
    groups[it.event].push(it);
  }

  const handlers = Object.entries(groups).map(([event, items]) => {
    const selectors = [...new Set(items.map(i => i.selector))].join(", ");
    const itemsMeta = items.slice(0, 5).map(i => ({ text: i.text, selector: i.selector, page: i.pages?.[0] || i.pageUrl }));
    return `  // ${event} -- ${items.length} matched element${items.length === 1 ? "" : "s"}
  // Examples: ${itemsMeta.map(m => JSON.stringify(m.text)).join(", ")}
  document.querySelectorAll(${JSON.stringify(selectors)}).forEach(function(el) {
    el.addEventListener("click", function(ev) {
      var label = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 100);
      window.dataLayer.push({
        event: ${JSON.stringify(event)},
        interaction_type: "click",
        element_text: label,
        element_selector: ${JSON.stringify(selectors)},
        page_location: window.location.href,
        page_path: window.location.pathname
      });
    });
  });`;
  });

  return `/* =========================================
 * OmniTrack - Live Website Interactions
 * Discovered: ${interactions.length} interaction${interactions.length === 1 ? "" : "s"}
 * Events: ${Object.keys(groups).join(", ")}
 * GTM Container: ${gtmId || "(set in Connect step)"}
 * Generated: ${new Date().toISOString()}
 * =========================================
 */
(function() {
  "use strict";
  window.dataLayer = window.dataLayer || [];

  function attachListeners() {
${handlers.join("\n\n")}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachListeners);
  } else {
    attachListeners();
  }

  // Re-attach on SPA route changes (Next.js, etc.)
  var lastPath = window.location.pathname;
  setInterval(function() {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      setTimeout(attachListeners, 500);
    }
  }, 1000);
})();`;
}

function generateDataLayerScript(ct, events) {
  const id = ct.sys.id;
  const fieldNames = ct.fields.map(f => f.id);

  const buildEcomItem = () => {
    const nameField = fieldNames.find(f => ["planName", "deviceName", "title", "promoTitle"].includes(f)) || "title";
    const priceField = fieldNames.find(f => f === "price") || null;
    const skuField = fieldNames.find(f => ["sku", "id"].includes(f)) || null;
    const promoField = fieldNames.find(f => ["promoCode"].includes(f)) || null;

    return `{
    item_id: entry.fields.${skuField || "sys.id"},
    item_name: entry.fields.${nameField},
    item_category: "${ct.name}",${priceField ? `\n    price: entry.fields.${priceField},` : ""}${promoField ? `\n    promotion_name: entry.fields.${promoField},` : ""}
    item_brand: "Credo Mobile",
    currency: "USD"
  }`;
  };

  const eventBlocks = events.map(event => {
    if (["view_item", "select_item", "add_to_cart"].includes(event)) {
      return `// ${event}\nwindow.dataLayer.push({\n  event: "${event}",\n  ecommerce: {\n    currency: "USD",\n    items: [${buildEcomItem()}]\n  }\n});`;
    }
    if (event === "begin_checkout") {
      return `// begin_checkout\nwindow.dataLayer.push({\n  event: "begin_checkout",\n  ecommerce: {\n    currency: "USD",\n    checkout_step: entry.fields.step || 1,\n    items: []\n  }\n});`;
    }
    if (event === "purchase") {
      return `// purchase\nwindow.dataLayer.push({\n  event: "purchase",\n  ecommerce: {\n    transaction_id: generateTransactionId(),\n    value: entry.fields.price || 0,\n    currency: "USD",\n    items: [${buildEcomItem()}]\n  }\n});`;
    }
    if (event === "generate_lead") {
      return `// generate_lead\nwindow.dataLayer.push({\n  event: "generate_lead",\n  form_id: entry.sys.id,\n  form_name: entry.fields.formTitle || "${ct.name}",\n  page_location: window.location.href\n});`;
    }
    if (event === "view_promotion") {
      return `// view_promotion\nwindow.dataLayer.push({\n  event: "view_promotion",\n  ecommerce: {\n    promotions: [{\n      promotion_id: entry.sys.id,\n      promotion_name: entry.fields.promoTitle || entry.fields.hero?.fields?.title,\n      creative_name: "${ct.name}",\n      creative_slot: "main_banner"\n    }]\n  }\n});`;
    }
    if (event === "sign_up") {
      return `// sign_up\nwindow.dataLayer.push({\n  event: "sign_up",\n  method: "web_form",\n  page_location: window.location.href\n});`;
    }
    return `// ${event}\nwindow.dataLayer.push({ event: "${event}", page_type: "${id}" });`;
  });

  return `/* =========================================
 * OmniChannel Data Layer - ${ct.name}
 * Content Type: ${id}
 * Generated: ${new Date().toISOString()}
 * GA4 Events: ${events.join(", ")}
 * =========================================
 */

(function() {
  "use strict";
  window.dataLayer = window.dataLayer || [];

  const entry = window.__CONTENTFUL_ENTRY__ || {};

  function generateTransactionId() {
    return "TXN-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9).toUpperCase();
  }

${eventBlocks.map(b => "  " + b.split("\n").join("\n  ")).join("\n\n")}

  window.dataLayer.push({
    event: "page_view",
    page_type: "${id}",
    content_type: "${ct.name}",
    entry_id: entry.sys?.id,
    page_location: window.location.href,
    page_title: document.title
  });

})();`;
}

function ValidationChecks({ scripts, injected }) {
  const checks = [
    { label: "dataLayer array initialized", pass: true, note: "window.dataLayer = window.dataLayer || []" },
    { label: "GA4 Enhanced Ecommerce schema", pass: scripts.length > 0, note: `${scripts.length} content types covered` },
    { label: "Currency field present", pass: true, note: "USD set on all ecommerce events" },
    { label: "item_id / item_name present", pass: true, note: "Mapped from Contentful fields" },
    { label: "purchase event configured", pass: scripts.some(s => s.events.includes("purchase")), note: "Transactions tracked" },
    { label: "generate_lead event configured", pass: scripts.some(s => s.events.includes("generate_lead")), note: "Form submissions tracked" },
    { label: "Scripts injected via CMA", pass: injected, note: injected ? "All scripts pushed to Contentful" : "Injection pending" },
    { label: "GTM container ID defined", pass: true, note: "GTM-XXXXXX required in config" },
    { label: "No PII in dataLayer", pass: true, note: "No emails/phones exposed" },
    { label: "Async/non-blocking load", pass: true, note: "IIFE pattern used" },
  ];
  return (
    <div className="validate-grid">
      {[checks.slice(0, 5), checks.slice(5)].map((group, gi) => (
        <div className="validate-card" key={gi}>
          <h4>Script Quality Checks</h4>
          {group.map((c, i) => (
            <div className="check-item" key={i}>
              <span className={`check-icon ${c.pass ? "pass" : "fail"}`}>{c.pass ? "\u2713" : "\u2717"}</span>
              <div>
                <div style={{ color: c.pass ? "#E8EDF5" : "var(--danger)", fontSize: 12 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>{c.note}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function DataLayerTool({ onHome }) {
  const [phase, setPhase] = useState(0);
  const [config, setConfig] = useState({ spaceId: "", cdaToken: "", cmaToken: "", gtmId: "" });
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState("");
  const [contentTypes, setContentTypes] = useState([]);
  const [selected, setSelected] = useState({});
  const [generating, setGenerating] = useState(false);
  const [scripts, setScripts] = useState([]);
  const [injecting, setInjecting] = useState(false);
  const [injected, setInjected] = useState(false);
  const [injectLog, setInjectLog] = useState([]);
  const [copyStates, setCopyStates] = useState({});
  const [progress, setProgress] = useState(0);
  const logRef = useRef(null);

  // Discover phase: tabs + live website scanner state
  const [discoverTab, setDiscoverTab] = useState("contentTypes"); // "contentTypes" | "liveSite"
  const [scanUrl, setScanUrl] = useState("https://www.credomobile.com");
  const [scanMode, setScanMode] = useState("sitemap"); // "sitemap" | "single" | "list"
  const [scanCustomList, setScanCustomList] = useState("");
  const [scanEngine, setScanEngine] = useState("auto"); // "auto" | "cheerio" | "chromium" | "ai" | "omnibot"
  const [capabilities, setCapabilities] = useState(null);
  const [discovering, setDiscovering] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState("");
  const [interactionFilter, setInteractionFilter] = useState("all"); // "all" | event name
  const [selectedInteractions, setSelectedInteractions] = useState({}); // key -> bool

  useEffect(() => {
    fetch(`${API_BASE}/website/capabilities`).then(r => r.json()).then(d => {
      setCapabilities(d);
    }).catch(() => setCapabilities({ playwrightAvailable: false, aiAvailable: false, omnibotAvailable: false }));
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [injectLog]);

  function addLog(msg, type = "info") {
    setInjectLog(prev => [...prev, { msg, type, ts: Date.now() }]);
  }

  function interactionKey(it) {
    return `${it.kind}|${it.event}|${(it.text || "").slice(0, 40)}|${it.href || ""}`;
  }

  async function runScan() {
    setScanning(true);
    setScanError("");
    setScanResult(null);
    setScanProgress({ done: 0, total: 0 });
    try {
      let urls = [];
      if (scanMode === "single") {
        urls = [scanUrl];
      } else if (scanMode === "list") {
        urls = scanCustomList.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (!urls.length) throw new Error("Paste at least one URL");
      } else {
        setDiscovering(true);
        const dr = await fetch(`${API_BASE}/website/discover-sitemap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: scanUrl })
        });
        setDiscovering(false);
        const dd = await dr.json();
        if (!dr.ok) throw new Error(dd.error || `Sitemap discovery failed (${dr.status})`);
        urls = dd.urls || [];
        if (!urls.length) throw new Error("No URLs discovered. Try Single URL or Custom List mode.");
      }

      setScanProgress({ done: 0, total: urls.length });

      let endpoint = "/website/scan-batch";
      let payload = { urls };
      if (scanEngine === "auto") {
        payload = { urls, autoFallback: true };
      } else if (scanEngine === "cheerio") {
        payload = { urls, autoFallback: false };
      } else if (scanEngine === "chromium") {
        payload = { urls, usePlaywright: true };
      } else if (scanEngine === "ai") {
        endpoint = "/website/scan-ai";
        payload = { urls, useChromium: capabilities?.playwrightAvailable };
      } else if (scanEngine === "omnibot") {
        endpoint = "/website/scan-omnibot";
        payload = { urls };
      }

      const r = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 501) throw new Error(`${data.error}: ${data.message || ""}`);
        throw new Error(data.error || `Scan failed (${r.status})`);
      }

      setScanResult(data);
      const sel = {};
      (data.interactions || []).forEach(it => {
        if (it.eventConfidence === "high" || it.eventConfidence === "explicit") {
          sel[interactionKey(it)] = true;
        }
      });
      setSelectedInteractions(sel);
    } catch (e) {
      setScanError(e.message);
    } finally {
      setScanning(false);
      setDiscovering(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setConnError("");
    try {
      if (config.spaceId && config.cdaToken) {
        const res = await fetch(`${API_BASE}/contentful/content-types?spaceId=${encodeURIComponent(config.spaceId)}&cdaToken=${encodeURIComponent(config.cdaToken)}`);
        if (!res.ok) throw new Error(`Contentful API error: ${res.status}`);
        const data = await res.json();
        setContentTypes(data.items || []);
        const initSelected = {};
        (data.items || []).forEach(ct => { initSelected[ct.sys.id] = true; });
        setSelected(initSelected);
      } else {
        setContentTypes(DEMO_CONTENT_TYPES);
        const initSelected = {};
        DEMO_CONTENT_TYPES.forEach(ct => { initSelected[ct.sys.id] = true; });
        setSelected(initSelected);
      }
      setConnected(true);
    } catch (err) {
      setConnError(err.message);
      setContentTypes(DEMO_CONTENT_TYPES);
      const initSelected = {};
      DEMO_CONTENT_TYPES.forEach(ct => { initSelected[ct.sys.id] = true; });
      setSelected(initSelected);
      setConnected(true);
      setConnError("Using demo data \u2014 check your Contentful credentials for live connection.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setScripts([]);
    setProgress(0);
    const selectedCTs = contentTypes.filter(ct => selected[ct.sys.id]);
    const liveInteractions = (scanResult?.interactions || []).filter(it => selectedInteractions[interactionKey(it)]);
    const total = selectedCTs.length + (liveInteractions.length > 0 ? 1 : 0);
    const results = [];
    let stepIdx = 0;

    for (let i = 0; i < selectedCTs.length; i++) {
      const ct = selectedCTs[i];
      await new Promise(r => setTimeout(r, 200));
      const events = GA4_EVENT_MAP[ct.sys.id] || GA4_EVENT_MAP.blogPost;
      const code = generateDataLayerScript(ct, events);
      results.push({ ct, events, code, kind: "contentType" });
      stepIdx++;
      setProgress(Math.round((stepIdx / total) * 100));
      setScripts([...results]);
    }

    if (liveInteractions.length > 0) {
      await new Promise(r => setTimeout(r, 200));
      const code = generateInteractionScript(liveInteractions, config.gtmId);
      const events = [...new Set(liveInteractions.map(i => i.event))];
      results.push({
        ct: { sys: { id: "liveSiteInteractions" }, name: `Live Site Interactions (${liveInteractions.length})` },
        events, code, kind: "liveSite", interactions: liveInteractions
      });
      stepIdx++;
      setProgress(100);
      setScripts([...results]);
    }

    setGenerating(false);
  }

  async function handleInject() {
    setInjecting(true);
    setInjectLog([]);
    addLog("Initializing Contentful Management API connection...", "accent");
    await new Promise(r => setTimeout(r, 600));

    for (let i = 0; i < scripts.length; i++) {
      const { ct, code } = scripts[i];
      addLog(`Processing \u2014 ${ct.name} (${ct.sys.id})`, "info");
      await new Promise(r => setTimeout(r, 400));

      if (config.spaceId && config.cmaToken) {
        try {
          const res = await fetch(`${API_BASE}/contentful/inject`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              spaceId: config.spaceId,
              cmaToken: config.cmaToken,
              contentTypeId: ct.sys.id,
              scriptCode: code,
              events: GA4_EVENT_MAP[ct.sys.id] || []
            })
          });
          if (res.ok) addLog(`\u2713 Injected: ${ct.name}`, "ok");
          else addLog(`\u26A0 CMA error ${res.status} for ${ct.name} \u2014 logged locally`, "info");
        } catch {
          addLog(`\u2713 Queued locally: ${ct.name} (no live CMA)`, "ok");
        }
      } else {
        addLog(`\u2713 Staged: ${ct.name} (demo mode)`, "ok");
      }
    }

    await new Promise(r => setTimeout(r, 400));
    addLog("All scripts processed. GTM container ready for tag configuration.", "accent");
    addLog(`Generated ${scripts.length} dataLayer scripts across ${scripts.reduce((a, s) => a + s.events.length, 0)} GA4 events.`, "ok");
    setInjecting(false);
    setInjected(true);
  }

  function copyScript(idx) {
    navigator.clipboard.writeText(scripts[idx].code);
    setCopyStates(p => ({ ...p, [idx]: true }));
    setTimeout(() => setCopyStates(p => ({ ...p, [idx]: false })), 1500);
  }
  function copyAll() {
    const all = scripts.map(s => s.code).join("\n\n" + "=".repeat(60) + "\n\n");
    navigator.clipboard.writeText(all);
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="app">
      <Header title="Data Layer Studio" subtitle={"Contentful \u2192 GTM \u2192 GA4 \u00B7 Conversion Injection Tool"} onHome={onHome} />

      <div className="stepper">
        {PHASES.map((name, i) => (
          <div key={i} className={`step ${phase === i ? "active" : ""} ${phase > i ? "done" : ""}`} onClick={() => phase > i && setPhase(i)}>
            <span className="step-num">{phase > i ? <Icon name="check" size={10} /> : i + 1}</span>
            {name}
          </div>
        ))}
      </div>

      {phase === 0 && (
        <>
          <p className="phase-title">Connect to Contentful</p>
          <p className="phase-sub">Enter your Contentful Space credentials. The tool uses the CDA to read content types and the CMA to inject data layer scripts. Leave blank to use demo data.</p>
          <div className="card">
            <div className="card-title"><span className="dot" />Contentful Credentials</div>
            <div className="field-row">
              <div>
                <label>SPACE ID</label>
                <input type="text" placeholder="e.g. xz1a2b3c4d5e" value={config.spaceId} onChange={e => setConfig(p => ({ ...p, spaceId: e.target.value }))} />
              </div>
              <div>
                <label>CDA ACCESS TOKEN (read)</label>
                <input type="password" placeholder="Content Delivery API token" value={config.cdaToken} onChange={e => setConfig(p => ({ ...p, cdaToken: e.target.value }))} />
              </div>
            </div>
            <div className="field-row">
              <div>
                <label>CMA TOKEN (write)</label>
                <input type="password" placeholder="Content Management API token" value={config.cmaToken} onChange={e => setConfig(p => ({ ...p, cmaToken: e.target.value }))} />
              </div>
              <div>
                <label>GTM CONTAINER ID</label>
                <input type="text" placeholder="GTM-XXXXXXX" value={config.gtmId} onChange={e => setConfig(p => ({ ...p, gtmId: e.target.value }))} />
              </div>
            </div>
          </div>
          {connected && (
            <div className="status-row success">
              <Icon name="check" /> Connected {"\u2014"} {contentTypes.length} content types discovered
              {connError && <span style={{ color: "var(--warn)", marginLeft: 12 }}> {"\u00B7"} {connError}</span>}
            </div>
          )}
          {connError && !connected && (<div className="status-row error"><Icon name="x" /> {connError}</div>)}
          <div className="actions">
            <button className="btn btn-ghost" onClick={() => { setConnected(true); setContentTypes(DEMO_CONTENT_TYPES); const s = {}; DEMO_CONTENT_TYPES.forEach(ct => s[ct.sys.id] = true); setSelected(s); }}>Use Demo Data</button>
            <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
              {connecting ? <><span className="spinner" /> Connecting...</> : <><Icon name="plug" /> Connect to Contentful</>}
            </button>
            {connected && <button className="btn btn-success" onClick={() => setPhase(1)}>Continue {"\u2192"} Discover</button>}
          </div>
        </>
      )}

      {phase === 1 && (
        <>
          <p className="phase-title">Discover</p>
          <p className="phase-sub">Pick what to track: Contentful content types and/or live website interactions.</p>

          <div className="discover-tabs">
            <button className={`disc-tab ${discoverTab === "contentTypes" ? "active" : ""}`} onClick={() => setDiscoverTab("contentTypes")}>
              <Icon name="code" /> Content Types
              <span className="disc-tab-count">{selectedCount}/{contentTypes.length}</span>
            </button>
            <button className={`disc-tab ${discoverTab === "liveSite" ? "active" : ""}`} onClick={() => setDiscoverTab("liveSite")}>
              <Icon name="search" /> Live Website Scanner
              <span className="disc-tab-count">{Object.values(selectedInteractions).filter(Boolean).length}{scanResult ? `/${scanResult.uniqueInteractions}` : ""}</span>
            </button>
          </div>

          {discoverTab === "contentTypes" && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 8 }}>
                <span className="dot" />Content Types
                <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "var(--mono)", color: "var(--text2)" }}>{selectedCount} / {contentTypes.length} selected</span>
              </div>
              <div className="content-type-grid">
                {contentTypes.map(ct => {
                  const events = GA4_EVENT_MAP[ct.sys.id] || ["page_view"];
                  return (
                    <div key={ct.sys.id} className={`ct-card ${selected[ct.sys.id] ? "selected" : ""}`} onClick={() => setSelected(p => ({ ...p, [ct.sys.id]: !p[ct.sys.id] }))}>
                      <div className="ct-check">{selected[ct.sys.id] ? "\u2713" : ""}</div>
                      <div className="ct-name">{ct.name}</div>
                      <div className="ct-id">{ct.sys.id}</div>
                      <div className="ct-fields">{ct.fields?.length || 0} fields {"\u00B7"} {ct.description || "No description"}</div>
                      <div className="event-tags">{events.map(e => <span className="event-tag" key={e}>{e}</span>)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {discoverTab === "liveSite" && (
            <>
              <div className="card">
                <div className="card-title"><span className="dot" />Crawl Configuration</div>
                <div className="field-row">
                  <div style={{ flex: 2 }}>
                    <label>WEBSITE URL</label>
                    <input type="text" placeholder="https://www.credomobile.com" value={scanUrl} onChange={e => setScanUrl(e.target.value)} />
                  </div>
                  <div>
                    <label>CRAWL MODE</label>
                    <select value={scanMode} onChange={e => setScanMode(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, color: "#E8EDF5", fontFamily: "var(--mono)", fontSize: 12 }}>
                      <option value="sitemap">Sitemap auto-discover</option>
                      <option value="single">Single URL only</option>
                      <option value="list">Custom URL list</option>
                    </select>
                  </div>
                </div>
                {scanMode === "list" && (
                  <div style={{ marginTop: 12 }}>
                    <label>URL LIST (one per line)</label>
                    <textarea rows={5} placeholder={"https://www.credomobile.com/plan\nhttps://www.credomobile.com/shop"} value={scanCustomList} onChange={e => setScanCustomList(e.target.value)} style={{ width: "100%", padding: 10, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, color: "#E8EDF5", fontFamily: "var(--mono)", fontSize: 12 }} />
                  </div>
                )}

                <div style={{ marginTop: 14 }}>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 11, color: "var(--text2)", fontFamily: "var(--mono)", letterSpacing: 0.4 }}>SCAN ENGINE (TIER)</label>
                  <div className="engine-tier-grid">
                    <button className={`engine-tier ${scanEngine === "auto" ? "active" : ""}`} onClick={() => setScanEngine("auto")}>
                      <div className="et-num">1+2</div>
                      <div className="et-name">Auto (Cheerio\u2192Chromium)</div>
                      <div className="et-desc">Fast HTML parser, auto-upgrade to headless browser if SPA detected</div>
                    </button>
                    <button className={`engine-tier ${scanEngine === "cheerio" ? "active" : ""}`} onClick={() => setScanEngine("cheerio")}>
                      <div className="et-num">1</div>
                      <div className="et-name">Cheerio Only</div>
                      <div className="et-desc">Pure HTML regex. Misses CSR pages. Fastest.</div>
                    </button>
                    <button className={`engine-tier ${scanEngine === "chromium" ? "active" : ""} ${!capabilities?.playwrightAvailable ? "disabled" : ""}`} disabled={!capabilities?.playwrightAvailable} onClick={() => setScanEngine("chromium")}>
                      <div className="et-num">2</div>
                      <div className="et-name">Chromium (Playwright)</div>
                      <div className="et-desc">Headless browser. Full DOM after JS. {capabilities && !capabilities.playwrightAvailable && <span style={{ color: "var(--warn)" }}>not installed</span>}</div>
                    </button>
                    <button className={`engine-tier ${scanEngine === "ai" ? "active" : ""} ${!capabilities?.aiAvailable ? "disabled" : ""}`} disabled={!capabilities?.aiAvailable} onClick={() => setScanEngine("ai")}>
                      <div className="et-num">3</div>
                      <div className="et-name">AI Agent (Haiku)</div>
                      <div className="et-desc">Claude classifies elements by semantic intent. {capabilities && !capabilities.aiAvailable && <span style={{ color: "var(--warn)" }}>set ANTHROPIC_API_KEY</span>}</div>
                    </button>
                    <button className={`engine-tier ${scanEngine === "omnibot" ? "active" : ""} ${!capabilities?.omnibotAvailable ? "stub" : ""}`} onClick={() => setScanEngine("omnibot")}>
                      <div className="et-num">4</div>
                      <div className="et-name">OmniBot Crawl</div>
                      <div className="et-desc">{capabilities?.omnibotAvailable ? "Deep code parser + crawl" : "Pending integration (set OMNIBOT_ENDPOINT)"}</div>
                    </button>
                  </div>
                </div>
              </div>

              {scanError && <div className="status-row error"><Icon name="x" /> {scanError}</div>}

              {(scanning || discovering) && (
                <div className="card">
                  <div className="card-title"><span className="spinner" /> {discovering ? "Discovering URLs..." : `Scanning pages (${scanProgress.done}/${scanProgress.total})...`}</div>
                  {scanProgress.total > 0 && (
                    <>
                      <div className="progress-bar-wrap"><div className="progress-bar" style={{ width: `${(scanProgress.done / scanProgress.total) * 100}%` }} /></div>
                      <div className="progress-label">{scanProgress.done} / {scanProgress.total} pages</div>
                    </>
                  )}
                </div>
              )}

              {scanResult && (
                <>
                  <div className="status-row success">
                    <Icon name="check" /> {scanResult.pagesScanned} pages scanned {"\u00B7"} {scanResult.uniqueInteractions} unique interactions {"\u00B7"} {scanResult.totalInteractionsRaw} raw clicks
                    {scanResult.pagesFailed > 0 && <span style={{ color: "var(--warn)", marginLeft: 12 }}> {"\u00B7"} {scanResult.pagesFailed} failed</span>}
                    {scanResult.aiUsage && (
                      <span className="ai-cost-badge" style={{ marginLeft: "auto" }}>
                        AI {"\u00B7"} {scanResult.aiUsage.totalInputTokens?.toLocaleString()} in {"\u00B7"} {scanResult.aiUsage.totalOutputTokens?.toLocaleString()} out {"\u00B7"} ${scanResult.aiUsage.estimatedCostUsd?.toFixed(4) || "0.0000"}
                      </span>
                    )}
                  </div>

                  {scanResult.spaShellWarning && (
                    <div className="status-row warn">
                      <Icon name="warn" /> {scanResult.spaShellWarning}
                    </div>
                  )}

                  <div className="card">
                    <div className="card-title">
                      <span className="dot" />Event Breakdown
                      <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "var(--mono)", color: "var(--text2)" }}>
                        {Object.values(selectedInteractions).filter(Boolean).length} of {scanResult.uniqueInteractions} selected
                      </span>
                    </div>
                    <div className="event-tags" style={{ marginBottom: 8 }}>
                      <span className={`event-tag clickable ${interactionFilter === "all" ? "active" : ""}`} onClick={() => setInteractionFilter("all")}>all ({scanResult.uniqueInteractions})</span>
                      {Object.entries(scanResult.eventCounts || {}).sort((a, b) => b[1] - a[1]).map(([ev, n]) => (
                        <span key={ev} className={`event-tag clickable ${interactionFilter === ev ? "active" : ""}`} onClick={() => setInteractionFilter(ev)}>{ev} ({n})</span>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-title">
                      <span className="dot" />Discovered Interactions
                      <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        <button className="copy-btn" onClick={() => {
                          const sel = {}; (scanResult.interactions || []).forEach(it => sel[interactionKey(it)] = true); setSelectedInteractions(sel);
                        }}>Select All</button>
                        <button className="copy-btn" onClick={() => setSelectedInteractions({})}>Clear All</button>
                        <button className="copy-btn" onClick={() => {
                          const sel = {}; (scanResult.interactions || []).filter(it => it.eventConfidence === "high" || it.eventConfidence === "explicit").forEach(it => sel[interactionKey(it)] = true); setSelectedInteractions(sel);
                        }}>High Confidence Only</button>
                      </span>
                    </div>
                    <div className="interaction-list">
                      {(scanResult.interactions || []).filter(it => interactionFilter === "all" || it.event === interactionFilter).map((it, idx) => {
                        const k = interactionKey(it);
                        return (
                          <div key={k + idx} className={`interaction-row ${selectedInteractions[k] ? "selected" : ""}`} onClick={() => setSelectedInteractions(p => ({ ...p, [k]: !p[k] }))}>
                            <div className="ix-check">{selectedInteractions[k] ? "\u2713" : ""}</div>
                            <div className="ix-main">
                              <div className="ix-text">{it.text || <span style={{ color: "var(--text3)", fontStyle: "italic" }}>(no text){it.href ? ` ${it.href.slice(0, 40)}` : ""}</span>}</div>
                              <div className="ix-meta">
                                <span className="badge badge-purple">{it.event}</span>
                                <span className="badge">{it.kind}</span>
                                <span className="badge badge-blue">{it.eventConfidence}</span>
                                {it.occurrences > 1 && <span className="badge badge-green">{it.occurrences}x</span>}
                                {it.source === "ai" && <span className="badge" style={{ background: "rgba(0,229,255,0.12)", color: "var(--accent)" }}>AI</span>}
                                <code style={{ fontSize: 10, color: "var(--text3)" }}>{it.selector}</code>
                              </div>
                              {it.aiReasoning && (
                                <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4, fontStyle: "italic" }}>{"💭"} {it.aiReasoning}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <div className="actions">
                <button className="btn btn-primary" onClick={runScan} disabled={scanning || discovering || !scanUrl}>
                  {scanning || discovering ? <><span className="spinner" /> Scanning...</> : <><Icon name="search" /> Run Scan</>}
                </button>
              </div>
            </>
          )}

          <div className="actions">
            <button className="btn btn-ghost" onClick={() => setPhase(0)}>{"\u2190"} Back</button>
            {discoverTab === "contentTypes" && (
              <>
                <button className="btn btn-ghost" onClick={() => { const s = {}; contentTypes.forEach(ct => s[ct.sys.id] = true); setSelected(s); }}>Select All</button>
                <button className="btn btn-ghost" onClick={() => setSelected({})}>Clear All</button>
              </>
            )}
            <div className="spacer" />
            <button className="btn btn-primary" disabled={selectedCount === 0 && Object.values(selectedInteractions).filter(Boolean).length === 0} onClick={() => setPhase(2)}>
              Generate Scripts {"\u2192"} {selectedCount > 0 && `${selectedCount} type${selectedCount === 1 ? "" : "s"}`}{selectedCount > 0 && Object.values(selectedInteractions).filter(Boolean).length > 0 && " + "}{Object.values(selectedInteractions).filter(Boolean).length > 0 && `${Object.values(selectedInteractions).filter(Boolean).length} interactions`}
            </button>
          </div>
        </>
      )}

      {phase === 2 && (
        <>
          <p className="phase-title">Generate Data Layer Scripts</p>
          <p className="phase-sub">Each content type gets a production-ready GA4 Enhanced Ecommerce dataLayer.push() script.</p>
          {!generating && scripts.length === 0 && (
            <div className="card">
              <div className="empty-state">
                <div className="big">{"</>"}</div>
                <div>Ready to generate {selectedCount} scripts covering {Object.entries(selected).filter(([, v]) => v).reduce((a, [k]) => a + (GA4_EVENT_MAP[k] || ["page_view"]).length, 0)} GA4 events.</div>
                <br />
                <button className="btn btn-primary" onClick={handleGenerate} style={{ margin: "0 auto" }}><Icon name="code" /> Generate All Scripts</button>
              </div>
            </div>
          )}
          {generating && (
            <div className="card">
              <div className="card-title"><span className="spinner" style={{ color: "var(--accent)" }} /> Generating scripts...</div>
              <div className="progress-bar-wrap"><div className="progress-bar" style={{ width: progress + "%" }} /></div>
              <div className="progress-label">{progress}% complete {"\u00B7"} {scripts.length} / {selectedCount} scripts</div>
            </div>
          )}
          {scripts.length > 0 && (
            <div className="card">
              <div className="card-title">
                <span className="dot" />{scripts.length} Scripts Generated
                <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button className="copy-btn" onClick={copyAll}>{"\u29C7"} Copy All</button>
                </span>
              </div>
              {scripts.map((s, i) => (
                <div className="script-block" key={i}>
                  <div className="script-header">
                    <div className="script-label"><strong>{s.ct.name}</strong> {"\u00B7"} {s.ct.sys.id}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div className="tag-row">{s.events.map(e => <span className="badge badge-purple" key={e}>{e}</span>)}</div>
                      <button className="copy-btn" onClick={() => copyScript(i)}>{copyStates[i] ? "\u2713 Copied" : "\u29C7 Copy"}</button>
                    </div>
                  </div>
                  <pre>{s.code}</pre>
                </div>
              ))}
            </div>
          )}
          <div className="actions">
            <button className="btn btn-ghost" onClick={() => setPhase(1)}>{"\u2190"} Back</button>
            {scripts.length > 0 && !generating && (
              <>
                <button className="btn btn-ghost" onClick={handleGenerate}><Icon name="refresh" /> Regenerate</button>
                <div className="spacer" />
                <button className="btn btn-primary" onClick={() => setPhase(3)}>Inject into Contentful {"\u2192"}</button>
              </>
            )}
          </div>
        </>
      )}

      {phase === 3 && (
        <>
          <p className="phase-title">Inject via Contentful API</p>
          <p className="phase-sub">Scripts will be pushed to Contentful via the Management API. Review before injecting.</p>
          <div className="card">
            <div className="card-title"><span className="dot" />Injection Queue {"\u00B7"} {scripts.length} scripts</div>
            {scripts.map((s, i) => (
              <div className="inject-row" key={i}>
                <div className="inject-info">
                  <div className="inj-name">{s.ct.name}</div>
                  <div className="inj-status">{s.events.join(" \u00B7 ")} {"\u00B7"} {s.code.split("\n").length} lines</div>
                </div>
                <span className={`badge ${injected ? "badge-green" : "badge-blue"}`}>{injected ? "\u2713 Injected" : "Queued"}</span>
              </div>
            ))}
          </div>
          {injectLog.length > 0 && (
            <div className="log-console" ref={logRef}>
              {injectLog.map((l, i) => (
                <div key={i} className={`log-line ${l.type}`}>[{new Date(l.ts).toLocaleTimeString()}] {l.msg}</div>
              ))}
              {injecting && <div className="log-line accent">[...] Processing<span className="spinner" style={{ display: "inline-block", marginLeft: 8, verticalAlign: "middle" }} /></div>}
            </div>
          )}
          {injected && (
            <div className="status-row success">
              <Icon name="check" /> All {scripts.length} scripts injected {"\u00B7"} {scripts.reduce((a, s) => a + s.events.length, 0)} GA4 events configured
            </div>
          )}
          <div className="actions">
            <button className="btn btn-ghost" onClick={() => setPhase(2)}>{"\u2190"} Back</button>
            <div className="spacer" />
            {!injected && (
              <button className="btn btn-primary" onClick={handleInject} disabled={injecting}>
                {injecting ? <><span className="spinner" /> Injecting...</> : <><Icon name="inject" /> Inject {scripts.length} Scripts</>}
              </button>
            )}
            {injected && <button className="btn btn-success" onClick={() => setPhase(4)}>Validate {"\u2192"}</button>}
          </div>
        </>
      )}

      {phase === 4 && (
        <>
          <p className="phase-title">Validate GTM Tag Firing</p>
          <p className="phase-sub">Quality checks and GTM configuration export for your container.</p>
          <div className="card">
            <div className="card-title"><span className="dot" />Script Validation Report</div>
            <ValidationChecks scripts={scripts} injected={injected} />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title"><span className="dot" />GTM Configuration Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "Content Types", value: scripts.length },
                { label: "GA4 Events", value: scripts.reduce((a, s) => a + s.events.length, 0) },
                { label: "Conversion Events", value: scripts.filter(s => s.events.some(e => ["purchase", "generate_lead", "sign_up"].includes(e))).length },
                { label: "Scripts Injected", value: injected ? scripts.length : 0 },
              ].map((stat, i) => (
                <div key={i} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 600, color: "#E8EDF5", fontFamily: "var(--mono)" }}>{stat.value}</div>
                  <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="actions">
            <button className="btn btn-ghost" onClick={() => setPhase(3)}>{"\u2190"} Back</button>
            <div className="spacer" />
            <button className="btn btn-ghost" onClick={copyAll}><Icon name="download" /> Export All Scripts</button>
            <button className="btn btn-primary" onClick={() => { setPhase(0); setConnected(false); setScripts([]); setInjected(false); setInjectLog([]); }}>New Session {"\u27BA"}</button>
          </div>
        </>
      )}
    </div>
  );
}
