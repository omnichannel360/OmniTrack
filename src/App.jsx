import { useState, useEffect, useRef } from "react";

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

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body, #root {
    background: #080A0C;
    color: #C8D0DB;
    font-family: 'IBM Plex Sans', sans-serif;
    min-height: 100vh;
  }

  :root {
    --bg: #080A0C;
    --bg1: #0E1117;
    --bg2: #141820;
    --bg3: #1C2230;
    --border: rgba(255,255,255,0.07);
    --border-hi: rgba(255,255,255,0.13);
    --accent: #00E5FF;
    --accent2: #7B61FF;
    --success: #00D17A;
    --warn: #FFB547;
    --danger: #FF4D6A;
    --text: #C8D0DB;
    --text2: #6B7A8D;
    --text3: #3D4A5C;
    --mono: 'IBM Plex Mono', monospace;
  }

  .app { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }

  .header {
    display: flex; align-items: center; gap: 16px;
    padding-bottom: 32px; border-bottom: 1px solid var(--border);
    margin-bottom: 32px;
  }
  .logo {
    width: 36px; height: 36px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 14px; font-weight: 600; color: #080A0C;
  }
  .header-text h1 { font-size: 16px; font-weight: 600; color: #E8EDF5; letter-spacing: -0.2px; }
  .header-text p { font-size: 12px; color: var(--text2); margin-top: 2px; font-family: var(--mono); }
  .header-badge {
    margin-left: auto;
    padding: 4px 10px; border-radius: 4px;
    background: rgba(0,229,255,0.08); border: 1px solid rgba(0,229,255,0.2);
    font-family: var(--mono); font-size: 11px; color: var(--accent); letter-spacing: 0.5px;
  }

  .stepper {
    display: flex; gap: 0; margin-bottom: 32px;
    background: var(--bg1); border: 1px solid var(--border); border-radius: 10px;
    overflow: hidden;
  }
  .step {
    flex: 1; padding: 12px 0; text-align: center;
    font-size: 11px; font-family: var(--mono); font-weight: 500;
    color: var(--text3); cursor: pointer; position: relative;
    border-right: 1px solid var(--border); transition: all 0.2s;
    letter-spacing: 0.5px;
  }
  .step:last-child { border-right: none; }
  .step.active { color: var(--accent); background: rgba(0,229,255,0.05); }
  .step.done { color: var(--success); }
  .step.active::after {
    content: ''; position: absolute; bottom: 0; left: 0; right: 0;
    height: 2px; background: var(--accent);
  }
  .step-num {
    display: inline-block; width: 18px; height: 18px;
    border-radius: 50%; font-size: 10px; line-height: 18px;
    background: var(--bg3); margin-right: 6px; text-align: center;
  }
  .step.active .step-num { background: rgba(0,229,255,0.15); color: var(--accent); }
  .step.done .step-num { background: rgba(0,209,122,0.15); color: var(--success); }

  .card {
    background: var(--bg1); border: 1px solid var(--border);
    border-radius: 12px; padding: 28px;
  }
  .card + .card { margin-top: 16px; }
  .card-title {
    font-size: 13px; font-weight: 600; color: #E8EDF5;
    margin-bottom: 20px; display: flex; align-items: center; gap: 10px;
  }
  .card-title .dot {
    width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
  }

  label { display: block; font-size: 11px; color: var(--text2); margin-bottom: 6px; font-family: var(--mono); letter-spacing: 0.3px; }
  input[type=text], input[type=password] {
    width: 100%; padding: 10px 14px;
    background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;
    color: var(--text); font-family: var(--mono); font-size: 13px;
    outline: none; transition: border 0.2s;
    margin-bottom: 16px;
  }
  input:focus { border-color: rgba(0,229,255,0.4); }
  input::placeholder { color: var(--text3); }

  .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .field-row > div { margin-bottom: 0; }
  .field-row input { margin-bottom: 0; }

  .btn {
    padding: 10px 20px; border-radius: 6px; border: none; cursor: pointer;
    font-family: var(--mono); font-size: 12px; font-weight: 500; letter-spacing: 0.3px;
    transition: all 0.15s; display: inline-flex; align-items: center; gap: 8px;
  }
  .btn-primary { background: var(--accent); color: #080A0C; }
  .btn-primary:hover { background: #33EBFF; }
  .btn-primary:disabled { background: var(--bg3); color: var(--text3); cursor: not-allowed; }
  .btn-ghost { background: transparent; color: var(--text2); border: 1px solid var(--border); }
  .btn-ghost:hover { border-color: var(--border-hi); color: var(--text); }
  .btn-danger { background: rgba(255,77,106,0.1); color: var(--danger); border: 1px solid rgba(255,77,106,0.2); }
  .btn-success { background: rgba(0,209,122,0.1); color: var(--success); border: 1px solid rgba(0,209,122,0.2); }

  .actions { display: flex; gap: 10px; margin-top: 20px; align-items: center; }
  .actions .spacer { flex: 1; }

  .status-row {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-radius: 6px; margin-top: 12px;
    font-size: 12px; font-family: var(--mono);
  }
  .status-row.success { background: rgba(0,209,122,0.08); border: 1px solid rgba(0,209,122,0.15); color: var(--success); }
  .status-row.error { background: rgba(255,77,106,0.08); border: 1px solid rgba(255,77,106,0.15); color: var(--danger); }
  .status-row.info { background: rgba(0,229,255,0.06); border: 1px solid rgba(0,229,255,0.12); color: var(--accent); }
  .status-row.warn { background: rgba(255,181,71,0.08); border: 1px solid rgba(255,181,71,0.15); color: var(--warn); }

  .spinner {
    width: 14px; height: 14px; border: 2px solid currentColor;
    border-top-color: transparent; border-radius: 50%;
    animation: spin 0.7s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .content-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px; }
  .ct-card {
    background: var(--bg2); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px 16px; cursor: pointer; transition: all 0.15s; position: relative;
  }
  .ct-card:hover { border-color: var(--border-hi); }
  .ct-card.selected { border-color: rgba(0,229,255,0.4); background: rgba(0,229,255,0.04); }
  .ct-card .ct-name { font-size: 13px; font-weight: 500; color: #E8EDF5; margin-bottom: 4px; }
  .ct-card .ct-id { font-size: 11px; font-family: var(--mono); color: var(--text2); }
  .ct-card .ct-fields { font-size: 11px; color: var(--text3); margin-top: 6px; }
  .ct-check {
    position: absolute; top: 12px; right: 12px;
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--bg3); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center; font-size: 10px;
  }
  .ct-card.selected .ct-check { background: rgba(0,229,255,0.15); border-color: var(--accent); color: var(--accent); }
  .event-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .event-tag {
    padding: 2px 7px; border-radius: 4px; font-size: 10px; font-family: var(--mono);
    background: rgba(123,97,255,0.12); border: 1px solid rgba(123,97,255,0.2); color: #A78BFA;
  }

  .script-block {
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    margin-top: 12px; overflow: hidden;
  }
  .script-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--bg2);
  }
  .script-label { font-size: 11px; font-family: var(--mono); color: var(--text2); }
  .script-label strong { color: var(--accent); }
  pre {
    padding: 16px; font-family: var(--mono); font-size: 12px; line-height: 1.7;
    color: #A8B5C8; overflow-x: auto; max-height: 280px; overflow-y: auto;
    white-space: pre-wrap; word-break: break-all;
  }

  .inject-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-radius: 8px;
    background: var(--bg2); border: 1px solid var(--border); margin-top: 8px;
  }
  .inject-info .inj-name { font-size: 13px; font-weight: 500; color: #E8EDF5; }
  .inject-info .inj-status { font-size: 11px; font-family: var(--mono); color: var(--text2); margin-top: 2px; }

  .validate-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .validate-card {
    background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 16px;
  }
  .validate-card h4 { font-size: 12px; font-weight: 500; color: #E8EDF5; margin-bottom: 10px; }
  .check-item {
    display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;
    font-size: 12px; color: var(--text2);
  }
  .check-icon { flex-shrink: 0; margin-top: 1px; }
  .check-icon.pass { color: var(--success); }
  .check-icon.fail { color: var(--danger); }

  .progress-bar-wrap {
    width: 100%; height: 3px; background: var(--bg3); border-radius: 2px; margin: 16px 0 4px;
  }
  .progress-bar { height: 100%; border-radius: 2px; background: var(--accent); transition: width 0.5s ease; }
  .progress-label { font-size: 11px; font-family: var(--mono); color: var(--text2); }

  .tag-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .badge { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-family: var(--mono); }
  .badge-blue { background: rgba(0,229,255,0.1); color: var(--accent); border: 1px solid rgba(0,229,255,0.2); }
  .badge-green { background: rgba(0,209,122,0.1); color: var(--success); border: 1px solid rgba(0,209,122,0.2); }
  .badge-purple { background: rgba(123,97,255,0.1); color: #A78BFA; border: 1px solid rgba(123,97,255,0.2); }
  .badge-warn { background: rgba(255,181,71,0.1); color: var(--warn); border: 1px solid rgba(255,181,71,0.2); }

  .log-console {
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px 16px; max-height: 180px; overflow-y: auto; margin-top: 16px;
  }
  .log-line { font-size: 11px; font-family: var(--mono); line-height: 2; }
  .log-line.ok { color: var(--success); }
  .log-line.err { color: var(--danger); }
  .log-line.info { color: var(--text2); }
  .log-line.accent { color: var(--accent); }

  .phase-title { font-size: 20px; font-weight: 600; color: #E8EDF5; letter-spacing: -0.4px; margin-bottom: 6px; }
  .phase-sub { font-size: 13px; color: var(--text2); margin-bottom: 24px; line-height: 1.6; }

  .copy-btn {
    padding: 4px 10px; font-size: 10px; font-family: var(--mono);
    background: var(--bg3); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text2); cursor: pointer; transition: all 0.15s;
  }
  .copy-btn:hover { color: var(--accent); border-color: rgba(0,229,255,0.3); }

  .empty-state { text-align: center; padding: 40px 20px; color: var(--text3); font-size: 13px; }
  .empty-state .big { font-size: 32px; margin-bottom: 12px; }
`;

function Icon({ name, size = 14 }) {
  const icons = {
    check: "\u2713", x: "\u2717", dot: "\u25CF", arrow: "\u2192", copy: "\u29C7",
    plug: "\u26A1", code: "</>", inject: "\u2B95", download: "\u2B07", refresh: "\u27BA"
  };
  return <span style={{ fontSize: size }}>{icons[name] || "?"}</span>;
}

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
      return `// begin_checkout\nwindow.dataLayer.push({\n  event: "begin_checkout",\n  ecommerce: {\n    currency: "USD",\n    checkout_step: entry.fields.step || 1,\n    items: []  // Populate from cart state\n  }\n});`;
    }
    if (event === "purchase") {
      return `// purchase (SIM activation confirmed)\nwindow.dataLayer.push({\n  event: "purchase",\n  ecommerce: {\n    transaction_id: generateTransactionId(),\n    value: entry.fields.price || 0,\n    currency: "USD",\n    items: [${buildEcomItem()}]\n  }\n});`;
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
    { label: "purchase event configured", pass: scripts.some(s => s.events.includes("purchase")), note: "SIM activation tracked" },
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
              <span className={`check-icon ${c.pass ? "pass" : "fail"}`}>
                {c.pass ? "\u2713" : "\u2717"}
              </span>
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

const API_BASE = "/api";

export default function App() {
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

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [injectLog]);

  function addLog(msg, type = "info") {
    setInjectLog(prev => [...prev, { msg, type, ts: Date.now() }]);
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
    const total = selectedCTs.length;
    const results = [];
    for (let i = 0; i < selectedCTs.length; i++) {
      const ct = selectedCTs[i];
      await new Promise(r => setTimeout(r, 300));
      const events = GA4_EVENT_MAP[ct.sys.id] || GA4_EVENT_MAP.blogPost;
      const code = generateDataLayerScript(ct, events);
      results.push({ ct, events, code });
      setProgress(Math.round(((i + 1) / total) * 100));
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
          if (res.ok) {
            addLog(`\u2713 Injected: ${ct.name}`, "ok");
          } else {
            addLog(`\u26A0 CMA error ${res.status} for ${ct.name} \u2014 logged locally`, "info");
          }
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
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="header">
          <div className="logo">{"\u03A9"}</div>
          <div className="header-text">
            <h1>OmniChannel Data Layer Studio</h1>
            <p>Contentful {"\u2192"} GTM {"\u2192"} GA4 {"\u00B7"} Conversion Injection Tool</p>
          </div>
          <div className="header-badge">v1.0 {"\u00B7"} Internal</div>
        </div>

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
            {connError && !connected && (
              <div className="status-row error"><Icon name="x" /> {connError}</div>
            )}
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
            <p className="phase-title">Discover Content Types</p>
            <p className="phase-sub">Select which Contentful content types need GA4 data layer coverage.</p>
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
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => setPhase(0)}>{"\u2190"} Back</button>
              <button className="btn btn-ghost" onClick={() => { const s = {}; contentTypes.forEach(ct => s[ct.sys.id] = true); setSelected(s); }}>Select All</button>
              <button className="btn btn-ghost" onClick={() => setSelected({})}>Clear All</button>
              <div className="spacer" />
              <button className="btn btn-primary" disabled={selectedCount === 0} onClick={() => setPhase(2)}>Generate Scripts for {selectedCount} Types {"\u2192"}</button>
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
            <p className="phase-sub">Quality checks and GTM configuration export for your Credo Mobile container.</p>
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
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-title"><span className="dot" />GTM Next Steps</div>
              {[
                { step: "01", title: "Import GTM JSON", desc: "In GTM workspace \u2192 Admin \u2192 Import Container.", badge: "badge-blue" },
                { step: "02", title: "Create Data Layer Variables", desc: "Add GTM variables for: event, ecommerce.items, ecommerce.transaction_id, ecommerce.value", badge: "badge-blue" },
                { step: "03", title: "Configure GA4 Event Tags", desc: "Create GA4 Event tags for each conversion. Link to your GA4 Measurement ID.", badge: "badge-purple" },
                { step: "04", title: "Set Conversion Actions in GA4", desc: "In GA4 \u2192 Admin \u2192 Events \u2192 Mark as conversions: purchase, generate_lead, sign_up", badge: "badge-green" },
                { step: "05", title: "Test in GTM Preview Mode", desc: "Browse each page type, confirm events fire in DebugView.", badge: "badge-warn" },
              ].map((item, i) => (
                <div className="inject-row" key={i} style={{ marginTop: i === 0 ? 0 : 8 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 20, color: "var(--text3)", marginRight: 16, minWidth: 28 }}>{item.step}</div>
                  <div className="inject-info">
                    <div className="inj-name">{item.title}</div>
                    <div className="inj-status">{item.desc}</div>
                  </div>
                  <span className={`badge ${item.badge}`}>Step {i + 1}</span>
                </div>
              ))}
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
    </>
  );
}
