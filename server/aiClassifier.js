import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import crypto from "crypto";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_HTML_TOKENS_APPROX = 30000; // ~120KB chars — Haiku handles fine, cheap
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const cache = new Map(); // pageUrl -> { hash, ts, result }

function pageHash(html) {
  return crypto.createHash("sha256").update(html).digest("hex").slice(0, 16);
}

function compactDom(html) {
  const $ = cheerio.load(html);
  // Strip scripts/styles/svgs/comments — irrelevant for interaction discovery
  $("script, style, noscript, svg, link, meta").remove();
  $("*").contents().each(function () {
    if (this.type === "comment") $(this).remove();
  });
  // Keep only interactive elements + their context
  const out = [];
  $("button, a, [role='button'], input[type='button'], input[type='submit'], form, [data-event], [data-track], [data-ga], [data-gtm]").each((_, el) => {
    const $el = $(el);
    const tag = el.tagName || el.name;
    const attrs = el.attribs || {};
    const text = $el.text().replace(/\s+/g, " ").trim().slice(0, 150);
    const ctx = $el.parent().clone().children().remove().end().text().replace(/\s+/g, " ").trim().slice(0, 100);
    out.push({
      tag,
      text,
      ctx,
      id: attrs.id,
      class: (attrs.class || "").slice(0, 100),
      href: attrs.href?.slice(0, 100),
      type: attrs.type,
      name: attrs.name,
      aria: attrs["aria-label"],
      dataEvent: attrs["data-event"] || attrs["data-track"] || attrs["data-ga"]
    });
  });
  // Dedup near-identical elements (same text + same tag) — common in carousels/repeated nav
  const seen = new Set();
  const deduped = [];
  for (const el of out) {
    const k = `${el.tag}|${el.text}|${el.href || ""}|${el.dataEvent || ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(el);
  }
  return deduped.slice(0, 60);
}

const SYSTEM_PROMPT = `You are an analytics tagging expert specializing in GA4 Enhanced Ecommerce.

You analyze interactive web elements (buttons, links, forms) extracted from a page and classify each by:
1. INTENT — what user goal does clicking this serve?
2. GA4 EVENT — the recommended GA4 event name (use standard GA4 event taxonomy)
3. CONFIDENCE — how sure are you?

GA4 standard events to use when applicable:
- page_view, view_item, view_item_list, select_item, add_to_cart, remove_from_cart, view_cart, begin_checkout, add_payment_info, add_shipping_info, purchase, refund
- add_to_wishlist, view_promotion, select_promotion
- generate_lead, sign_up, login, search, share
- file_download, video_start, video_complete, scroll
- For non-conversion clicks use: cta_click, nav_click, link_click, phone_click, email_click, outbound_link

Intent categories:
- primary_cta — main conversion action (Add to Cart, Sign Up, Buy Now, Get Started)
- secondary_cta — supporting action (Learn More, View Details, Compare)
- nav — navigation (header/footer/menu links)
- utility — login, search, language switch, account
- form — form submission
- media — video/audio play
- contact — phone, email, contact form
- promotional — banner CTAs, hero buttons

Return ONLY valid JSON. No prose. No markdown fences.`;

function buildUserPrompt(elements, pageUrl, pageTitle) {
  return `Page: ${pageUrl}
Title: ${pageTitle || "(untitled)"}

${elements.length} interactive elements extracted from this page. For each, classify it.

Elements:
${JSON.stringify(elements, null, 2)}

Return JSON in this exact shape:
{
  "interactions": [
    {
      "index": 0,
      "intent": "primary_cta",
      "ga4_event": "add_to_cart",
      "confidence": "high",
      "reasoning": "brief 1-line why",
      "suggested_params": { "item_name": "...", "item_category": "..." }
    }
  ]
}

Rules:
- "index" matches the element's position in the input array (0-based)
- "intent" must be one of: primary_cta, secondary_cta, nav, utility, form, media, contact, promotional
- "ga4_event" must be a valid GA4 event name (snake_case)
- "confidence" must be: high | medium | low
- "reasoning" max 80 chars
- "suggested_params" optional, only when you can infer real values from element text/context
- Return one entry per input element, in order. Do not skip any.`;
}

export async function classifyPage(pageUrl, html, opts = {}) {
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const hash = pageHash(html);
  const cached = cache.get(pageUrl);
  if (cached && cached.hash === hash && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ...cached.result, fromCache: true };
  }

  const elements = compactDom(html);
  if (!elements.length) {
    return { pageUrl, interactions: [], elements: [], reasoning: "No interactive elements extracted from DOM", fromCache: false };
  }

  const $ = cheerio.load(html);
  const pageTitle = $("title").text().trim() || $("h1").first().text().trim();

  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 16384,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(elements, pageUrl, pageTitle) }]
  });

  const text = resp.content.find(b => b.type === "text")?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI returned no JSON: " + text.slice(0, 200));

  let parsed;
  try { parsed = JSON.parse(jsonMatch[0]); }
  catch (e) {
    // Salvage truncated JSON: try parsing only completed entries
    const arrMatch = jsonMatch[0].match(/"interactions"\s*:\s*\[([\s\S]*)/);
    if (arrMatch) {
      const rawArr = arrMatch[1];
      const objects = [];
      let depth = 0, start = -1;
      for (let i = 0; i < rawArr.length; i++) {
        const ch = rawArr[i];
        if (ch === "{") { if (depth === 0) start = i; depth++; }
        else if (ch === "}") {
          depth--;
          if (depth === 0 && start >= 0) {
            try { objects.push(JSON.parse(rawArr.slice(start, i + 1))); } catch {}
            start = -1;
          }
        }
      }
      if (objects.length) {
        parsed = { interactions: objects, _salvaged: true };
      } else {
        throw new Error("AI JSON parse failed: " + e.message);
      }
    } else {
      throw new Error("AI JSON parse failed: " + e.message);
    }
  }

  const enriched = (parsed.interactions || []).map(ai => {
    const el = elements[ai.index];
    if (!el) return null;
    return {
      tag: el.tag,
      kind: ai.intent || "click",
      text: el.text,
      href: el.href,
      selector: el.id ? `#${el.id}` : `${el.tag}${el.class ? "." + el.class.trim().split(/\s+/)[0] : ""}`,
      event: ai.ga4_event || "click",
      eventConfidence: ai.confidence === "high" ? "high" : ai.confidence === "medium" ? "medium" : "low",
      attrs: { id: el.id, class: el.class, "data-event": el.dataEvent },
      pageUrl,
      aiReasoning: ai.reasoning,
      aiSuggestedParams: ai.suggested_params || null,
      source: "ai"
    };
  }).filter(Boolean);

  const result = {
    pageUrl,
    title: pageTitle,
    interactions: enriched,
    elementCount: elements.length,
    classifiedCount: enriched.length,
    model: MODEL,
    inputTokens: resp.usage?.input_tokens,
    outputTokens: resp.usage?.output_tokens,
    fromCache: false
  };

  cache.set(pageUrl, { hash, ts: Date.now(), result });
  return result;
}

export async function classifyPages(urls, fetchHtml, opts = {}) {
  const results = [];
  const errors = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const url of urls.slice(0, 50)) {
    try {
      const html = await fetchHtml(url);
      const r = await classifyPage(url, html, opts);
      results.push(r);
      totalInputTokens += r.inputTokens || 0;
      totalOutputTokens += r.outputTokens || 0;
    } catch (e) {
      errors.push({ url, error: e.message });
    }
  }

  const merged = new Map();
  for (const page of results) {
    for (const it of page.interactions) {
      const k = `${it.kind}|${it.event}|${(it.text || "").slice(0, 40)}|${it.href || ""}`;
      if (!merged.has(k)) merged.set(k, { ...it, pages: [page.pageUrl], occurrences: 1 });
      else {
        const m = merged.get(k);
        m.occurrences++;
        if (!m.pages.includes(page.pageUrl)) m.pages.push(page.pageUrl);
      }
    }
  }

  const grouped = [...merged.values()];
  const eventCounts = {};
  for (const it of grouped) eventCounts[it.event] = (eventCounts[it.event] || 0) + 1;

  // Estimated cost (Haiku 4.5: ~$1/M input, ~$5/M output)
  const estimatedCostUsd = (totalInputTokens * 1 / 1_000_000) + (totalOutputTokens * 5 / 1_000_000);

  return {
    pagesScanned: results.length,
    pagesFailed: errors.length,
    errors,
    totalInteractionsRaw: results.reduce((a, p) => a + p.interactions.length, 0),
    uniqueInteractions: grouped.length,
    interactions: grouped.sort((a, b) => b.occurrences - a.occurrences),
    eventCounts,
    pages: results.map(p => ({ url: p.pageUrl, title: p.title, interactionCount: p.interactions.length, fromCache: p.fromCache })),
    aiUsage: {
      model: MODEL,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000
    },
    engine: "ai"
  };
}

export function clearAiCache() {
  cache.clear();
}
