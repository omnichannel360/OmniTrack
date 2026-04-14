import { Header, Icon } from "./shared.jsx";

const TOOLS = [
  {
    id: "scanner",
    icon: "\u2315", iconClass: "gsc",
    title: "Content Model Scanner",
    desc: "One-click analysis of your Contentful space. Detects global/layout/tracking content types that allow zero-code injection. Run this first to plan your strategy.",
    meta: "Read-only scan \u00B7 CDA token"
  },
  {
    id: "bootstrap",
    icon: "\u26A1", iconClass: "dl",
    title: "Bootstrap Contentful",
    desc: "One-click setup. Auto-creates required content models (headSnippet, seoSchema, dataLayerScript). Run this first.",
    meta: "Run once \u00B7 CMA token"
  },
  {
    id: "datalayer",
    icon: "DL", iconClass: "dl",
    title: "Data Layer",
    desc: "Generate GA4 Enhanced Ecommerce dataLayer.push() scripts per Contentful content type and inject via CMA.",
    meta: "5 phases \u00B7 GA4 events"
  },
  {
    id: "ga4",
    icon: "GA", iconClass: "ga",
    title: "GA4",
    desc: "Inject Google Analytics 4 gtag.js snippet into the site head via the CMS headSnippet entry.",
    meta: "Measurement ID \u00B7 gtag.js"
  },
  {
    id: "gtm",
    icon: "GTM", iconClass: "gtm",
    title: "GTM",
    desc: "Inject Google Tag Manager container (head + noscript body) into the CMS for the whole site.",
    meta: "Container ID \u00B7 head + body"
  },
  {
    id: "gsc",
    icon: "GSC", iconClass: "gsc",
    title: "GSC Verification",
    desc: "Inject Google Search Console site verification meta tag into the site head for domain ownership.",
    meta: "<meta> tag \u00B7 head"
  },
  {
    id: "schema",
    icon: "LD+", iconClass: "schema",
    title: "Schema",
    desc: "Pull entries from Contentful, analyze content, generate JSON-LD schema, and inject back as SEO entries.",
    meta: "JSON-LD \u00B7 schema.org"
  },
  {
    id: "nextjs",
    icon: "NXT", iconClass: "ga",
    title: "Next.js Integration",
    desc: "Generate the Next.js component that reads injected entries from Contentful and renders them in your site head.",
    meta: "App Router \u00B7 1-file drop"
  }
];

export default function Home({ onSelect }) {
  return (
    <div className="app">
      <Header
        title="OmniChannel Data Layer Studio"
        subtitle="Unified CMS injection for tracking, verification and structured data"
        badge="v1.2 \u00B7 Internal"
      />
      <p className="phase-title">Choose a Tool</p>
      <p className="phase-sub">
        Run <strong>Bootstrap</strong> first to auto-provision Contentful. Then use any tool;
        they each manage their own environment and credentials.
        Inject Next.js integration once so new entries appear on the live site automatically.
      </p>
      <div className="home-grid">
        {TOOLS.map(t => (
          <div key={t.id} className="tool-card" onClick={() => onSelect(t.id)}>
            <div className={`tool-icon ${t.iconClass}`}>{t.icon}</div>
            <h3>{t.title}</h3>
            <p>{t.desc}</p>
            <div className="tool-meta">
              <span>{t.meta}</span>
              <span className="enter">Enter <Icon name="arrow" /></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
