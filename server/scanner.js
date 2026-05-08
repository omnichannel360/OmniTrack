import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 15000;
const MAX_PAGES = 50;
const MAX_INTERACTIONS_PER_PAGE = 200;

export async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout || FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        ...(opts.headers || {})
      }
    });
    return r;
  } finally {
    clearTimeout(t);
  }
}

async function crawlInternalLinksFromRoot(rootUrl, maxPages = 50) {
  const base = new URL(rootUrl);
  const visited = new Set();
  const queue = [rootUrl];
  const found = new Set();

  while (queue.length && found.size < maxPages) {
    const u = queue.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    try {
      const r = await fetchWithTimeout(u);
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("html")) continue;
      const html = await r.text();
      const $ = cheerio.load(html);
      found.add(u);
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        const norm = normalizeUrl(href, u);
        if (!norm) return;
        try {
          const x = new URL(norm);
          if (x.host !== base.host) return;
          if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|css|js|ico)$/i.test(x.pathname)) return;
          if (!visited.has(norm) && found.size + queue.length < maxPages * 2) queue.push(norm);
        } catch {}
      });
    } catch {}
  }
  return [...found];
}

function normalizeUrl(u, base) {
  try {
    return new URL(u, base).toString().replace(/#.*$/, "");
  } catch {
    return null;
  }
}

export async function discoverSitemap(rootUrl) {
  const base = new URL(rootUrl);
  const candidates = [
    `${base.origin}/sitemap.xml`,
    `${base.origin}/sitemap_index.xml`,
    `${base.origin}/sitemap-index.xml`
  ];

  let robotsSitemaps = [];
  try {
    const robotsRes = await fetchWithTimeout(`${base.origin}/robots.txt`);
    if (robotsRes.ok) {
      const txt = await robotsRes.text();
      robotsSitemaps = [...txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => m[1]);
    }
  } catch {}

  const queue = [...new Set([...robotsSitemaps, ...candidates])];
  const urls = new Set();
  const seen = new Set();
  let foundSitemap = null;

  while (queue.length && urls.size < MAX_PAGES * 5) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    try {
      const r = await fetchWithTimeout(sm);
      if (!r.ok) continue;
      const xml = await r.text();
      foundSitemap = foundSitemap || sm;
      const $ = cheerio.load(xml, { xmlMode: true });
      $("sitemap > loc").each((_, el) => {
        const u = $(el).text().trim();
        if (u) queue.push(u);
      });
      $("url > loc").each((_, el) => {
        const u = $(el).text().trim();
        if (u && u.startsWith(base.origin)) urls.add(u);
      });
    } catch {}
  }

  if (urls.size === 0) {
    const crawled = await crawlInternalLinksFromRoot(rootUrl, MAX_PAGES);
    return {
      sitemapUrl: null,
      method: "link_crawl",
      urls: crawled,
      totalDiscovered: crawled.length
    };
  }

  return {
    sitemapUrl: foundSitemap,
    method: "sitemap",
    urls: [...urls].slice(0, MAX_PAGES),
    totalDiscovered: urls.size
  };
}

const ECOM_PATTERNS = [
  { rx: /add[\s_-]?to[\s_-]?cart|add[\s_-]?cart|atc|buy[\s_-]?now/i, event: "add_to_cart", priority: 10 },
  { rx: /checkout|proceed[\s_-]?to[\s_-]?(?:checkout|payment)/i, event: "begin_checkout", priority: 9 },
  { rx: /place[\s_-]?order|complete[\s_-]?(?:purchase|order)|pay[\s_-]?now/i, event: "purchase", priority: 9 },
  { rx: /remove[\s_-]?(?:from[\s_-]?)?cart/i, event: "remove_from_cart", priority: 8 },
  { rx: /view[\s_-]?cart|shopping[\s_-]?cart|my[\s_-]?cart/i, event: "view_cart", priority: 7 },
  { rx: /wishlist|save[\s_-]?for[\s_-]?later|favorite/i, event: "add_to_wishlist", priority: 6 },
  { rx: /sign[\s_-]?up|register|create[\s_-]?account|join[\s_-]?now/i, event: "sign_up", priority: 7 },
  { rx: /log[\s_-]?in|sign[\s_-]?in/i, event: "login", priority: 6 },
  { rx: /subscribe|newsletter/i, event: "generate_lead", priority: 6 },
  { rx: /contact[\s_-]?(?:us)?|get[\s_-]?(?:in[\s_-]?touch|quote)|request[\s_-]?demo/i, event: "generate_lead", priority: 7 },
  { rx: /search/i, event: "search", priority: 4 },
  { rx: /share/i, event: "share", priority: 3 },
  { rx: /select[\s_-]?(?:plan|device|phone)|choose[\s_-]?(?:plan|device)/i, event: "select_item", priority: 8 },
  { rx: /view[\s_-]?(?:plan|device|details|more)|see[\s_-]?details/i, event: "view_item", priority: 5 },
  { rx: /promo|coupon|apply[\s_-]?code/i, event: "select_promotion", priority: 6 }
];

function classifyText(text, attrs) {
  const haystack = `${text} ${attrs.id || ""} ${attrs.class || ""} ${attrs.name || ""} ${attrs["data-event"] || ""} ${attrs["data-action"] || ""} ${attrs["data-track"] || ""} ${attrs["data-ga"] || ""} ${attrs.href || ""}`.toLowerCase();
  let best = null;
  for (const p of ECOM_PATTERNS) {
    if (p.rx.test(haystack)) {
      if (!best || p.priority > best.priority) best = p;
    }
  }
  return best;
}

function buildSelector($, el) {
  const $el = $(el);
  const id = $el.attr("id");
  if (id) return `#${id}`;
  const dataAttrs = ["data-testid", "data-test", "data-cy", "data-track", "data-event", "data-id"];
  for (const a of dataAttrs) {
    const v = $el.attr(a);
    if (v) return `[${a}="${v}"]`;
  }
  const tag = el.tagName || el.name || "*";
  const cls = ($el.attr("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (cls.length) return `${tag}.${cls.join(".")}`;
  const href = $el.attr("href");
  if (href && tag === "a") return `a[href="${href}"]`;
  return tag;
}

function getAttrs($el) {
  const out = {};
  const node = $el[0];
  if (node && node.attribs) Object.assign(out, node.attribs);
  return out;
}

function dedupKey(item) {
  return `${item.tag}|${item.text.slice(0, 40)}|${item.event || "click"}|${item.href || ""}`;
}

export function extractInteractions(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  const push = (raw) => {
    if (!raw || !raw.text) return;
    raw.text = raw.text.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!raw.text && !raw.href) return;
    const key = dedupKey(raw);
    if (seen.has(key)) return;
    seen.add(key);
    items.push(raw);
  };

  $("button, [role='button'], input[type='button'], input[type='submit']").each((_, el) => {
    if (items.length >= MAX_INTERACTIONS_PER_PAGE) return false;
    const $el = $(el);
    const attrs = getAttrs($el);
    const text = $el.text() || attrs.value || attrs["aria-label"] || attrs.title || "";
    const cls = classifyText(text, attrs);
    push({
      tag: "button",
      kind: cls ? "ecommerce" : "button",
      text,
      selector: buildSelector($, el),
      event: cls?.event || "click",
      eventConfidence: cls ? "high" : "medium",
      attrs: { id: attrs.id, class: attrs.class, "data-event": attrs["data-event"] },
      pageUrl
    });
  });

  $("a").each((_, el) => {
    if (items.length >= MAX_INTERACTIONS_PER_PAGE) return false;
    const $el = $(el);
    const attrs = getAttrs($el);
    const href = attrs.href || "";
    const text = $el.text() || attrs["aria-label"] || attrs.title || "";

    if (!href || href === "#" || href.startsWith("javascript:")) return;

    let kind = "link";
    let event = "click";
    let confidence = "low";
    if (href.startsWith("tel:")) { kind = "phone_click"; event = "phone_click"; confidence = "high"; }
    else if (href.startsWith("mailto:")) { kind = "email_click"; event = "email_click"; confidence = "high"; }
    else if (/\.(pdf|doc|docx|xls|xlsx|zip)$/i.test(href)) { kind = "file_download"; event = "file_download"; confidence = "high"; }
    else {
      try {
        const u = new URL(href, pageUrl);
        if (u.host && u.host !== new URL(pageUrl).host) { kind = "outbound_link"; event = "outbound_link"; confidence = "medium"; }
      } catch {}
    }

    const cls = classifyText(text, attrs);
    if (cls) { event = cls.event; kind = "cta"; confidence = "high"; }

    push({
      tag: "a",
      kind,
      text,
      href,
      selector: buildSelector($, el),
      event,
      eventConfidence: confidence,
      attrs: { id: attrs.id, class: attrs.class },
      pageUrl
    });
  });

  $("form").each((_, el) => {
    const $el = $(el);
    const attrs = getAttrs($el);
    const action = attrs.action || "";
    const name = attrs.name || attrs.id || "";
    const text = name || action.split("/").pop() || "form";

    let event = "form_submit";
    const cls = classifyText(`${text} ${action}`, attrs);
    if (cls) event = cls.event;

    const fields = [];
    $el.find("input, select, textarea").each((_, f) => {
      const fa = getAttrs($(f));
      if (fa.type !== "hidden" && fa.type !== "submit") {
        fields.push({ name: fa.name || fa.id, type: fa.type || "text" });
      }
    });

    push({
      tag: "form",
      kind: "form",
      text,
      selector: buildSelector($, el),
      event,
      eventConfidence: cls ? "high" : "medium",
      attrs: { id: attrs.id, action, method: attrs.method, fieldCount: fields.length },
      pageUrl
    });
  });

  $("video, audio, [data-video], iframe[src*='youtube'], iframe[src*='vimeo']").each((_, el) => {
    const $el = $(el);
    const attrs = getAttrs($el);
    const src = attrs.src || attrs["data-src"] || "";
    push({
      tag: el.tagName || "media",
      kind: "media",
      text: attrs.title || attrs["aria-label"] || src.split("/").pop() || "video",
      selector: buildSelector($, el),
      event: "video_start",
      eventConfidence: "medium",
      attrs: { src },
      pageUrl
    });
  });

  $("[data-event], [data-track], [data-ga], [data-gtm], [data-analytics]").each((_, el) => {
    const $el = $(el);
    const attrs = getAttrs($el);
    const explicit = attrs["data-event"] || attrs["data-track"] || attrs["data-ga"] || attrs["data-gtm"] || attrs["data-analytics"];
    push({
      tag: el.tagName || "tagged",
      kind: "tagged",
      text: $el.text() || explicit,
      selector: buildSelector($, el),
      event: explicit,
      eventConfidence: "explicit",
      attrs: { id: attrs.id, class: attrs.class },
      pageUrl
    });
  });

  const bodyTextLength = $("body").text().replace(/\s+/g, " ").trim().length;
  const scriptCount = $("script").length;
  const domNodes = $("*").length;
  const isSpaShell = (domNodes < 150 && items.length < 8 && scriptCount > 5) ||
                     (items.length < 3 && $("script#__NEXT_DATA__").length > 0);

  if (isSpaShell) {
    const nextData = $("script#__NEXT_DATA__").html();
    if (nextData) {
      try {
        const parsed = JSON.parse(nextData);
        const haystack = JSON.stringify(parsed).toLowerCase();
        const ctaHints = [];
        const ctaWords = ["add to cart", "buy now", "checkout", "select plan", "choose", "sign up", "subscribe", "get started", "learn more", "view details", "shop now"];
        for (const w of ctaWords) {
          const rx = new RegExp(`["']([^"']*${w}[^"']*)["']`, "gi");
          let mt;
          while ((mt = rx.exec(haystack)) && ctaHints.length < 30) {
            const txt = mt[1].slice(0, 80);
            if (txt && !ctaHints.includes(txt)) ctaHints.push(txt);
          }
        }
        for (const text of ctaHints) {
          const cls = classifyText(text, {});
          push({
            tag: "button",
            kind: "ssr_hint",
            text,
            selector: `button:contains("${text.slice(0,30)}")`,
            event: cls?.event || "click",
            eventConfidence: "low",
            attrs: { source: "__NEXT_DATA__" },
            pageUrl
          });
        }
      } catch {}
    }
  }

  return {
    pageUrl,
    title: $("title").text().trim() || $("h1").first().text().trim(),
    interactions: items,
    stats: {
      bodyTextLength,
      scriptCount,
      domNodes: $("*").length,
      isSpaShell
    }
  };
}

let playwrightModule = null;
let playwrightChecked = false;
async function tryLoadPlaywright() {
  if (playwrightChecked) return playwrightModule;
  playwrightChecked = true;
  try {
    playwrightModule = await import("playwright");
  } catch {
    playwrightModule = null;
  }
  return playwrightModule;
}

async function scanPageWithPlaywright(pageUrl) {
  const pw = await tryLoadPlaywright();
  if (!pw) throw new Error("Playwright not installed");
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: UA });
    const page = await ctx.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 });
    const html = await page.content();
    return extractInteractions(html, pageUrl);
  } finally {
    await browser.close();
  }
}

export async function scanPage(pageUrl, opts = {}) {
  const r = await fetchWithTimeout(pageUrl);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${pageUrl}`);
  const html = await r.text();
  const result = extractInteractions(html, pageUrl);

  if (opts.usePlaywright === true || (opts.autoFallback !== false && result.stats.isSpaShell)) {
    const pw = await tryLoadPlaywright();
    if (pw) {
      try {
        const pwResult = await scanPageWithPlaywright(pageUrl);
        pwResult.engine = "playwright";
        return pwResult;
      } catch (e) {
        result.playwrightError = e.message;
      }
    } else {
      result.playwrightAvailable = false;
    }
  }

  result.engine = "cheerio";
  return result;
}

export async function isPlaywrightAvailable() {
  return !!(await tryLoadPlaywright());
}

export async function scanPages(urls, onProgress, opts = {}) {
  const results = [];
  const errors = [];
  const all = urls.slice(0, MAX_PAGES);
  for (let i = 0; i < all.length; i++) {
    const u = all[i];
    try {
      const r = await scanPage(u, opts);
      results.push(r);
    } catch (e) {
      errors.push({ url: u, error: e.message });
    }
    if (onProgress) onProgress(i + 1, all.length);
  }

  const merged = new Map();
  for (const page of results) {
    for (const it of page.interactions) {
      const k = `${it.kind}|${it.event}|${(it.text || "").slice(0, 40)}|${it.href || ""}`;
      if (!merged.has(k)) {
        merged.set(k, { ...it, pages: [page.pageUrl], occurrences: 1 });
      } else {
        const m = merged.get(k);
        m.occurrences++;
        if (!m.pages.includes(page.pageUrl)) m.pages.push(page.pageUrl);
      }
    }
  }

  const grouped = [...merged.values()];
  const eventCounts = {};
  for (const it of grouped) eventCounts[it.event] = (eventCounts[it.event] || 0) + 1;

  const spaShellPages = results.filter(p => p.stats.isSpaShell).length;

  return {
    pagesScanned: results.length,
    pagesFailed: errors.length,
    errors,
    totalInteractionsRaw: results.reduce((a, p) => a + p.interactions.length, 0),
    uniqueInteractions: grouped.length,
    interactions: grouped.sort((a, b) => b.occurrences - a.occurrences),
    eventCounts,
    spaShellWarning: spaShellPages > results.length / 2 ? `${spaShellPages}/${results.length} pages appear SPA-rendered. Cheerio may miss client-only widgets. Enable Playwright for full coverage.` : null,
    pages: results.map(p => ({ url: p.pageUrl, title: p.title, interactionCount: p.interactions.length, isSpaShell: p.stats.isSpaShell }))
  };
}
