import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { discoverSitemap, scanPage, scanPages, isPlaywrightAvailable, fetchWithTimeout } from "./scanner.js";
import { classifyPages, clearAiCache } from "./aiClassifier.js";
import { appendInjection, readInjections, clearLog, getStats } from "./injectionLog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3010;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Serve static built files
app.use(express.static(join(__dirname, "../dist")));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "omnitrack-datalayer-studio", version: "1.0.0" });
});

// Bootstrap: create required content models idempotently (headSnippet, seoSchema, dataLayerScript)
const CONTENT_MODELS = {
  headSnippet: {
    name: "Head Snippet",
    description: "Injected head/body snippets (GA4, GTM, GSC) managed by OmniTrack.",
    displayField: "toolType",
    fields: [
      { id: "toolType", name: "Tool Type", type: "Symbol", required: true, localized: false },
      { id: "identifier", name: "Identifier", type: "Symbol", required: false, localized: false },
      { id: "code", name: "Code", type: "Text", required: true, localized: false },
      { id: "updatedAt", name: "Updated At", type: "Date", required: false, localized: false }
    ]
  },
  seoSchema: {
    name: "SEO Schema",
    description: "JSON-LD structured data entries generated and managed by OmniTrack.",
    displayField: "schemaType",
    fields: [
      { id: "sourceEntryId", name: "Source Entry ID", type: "Symbol", required: true, localized: false },
      { id: "contentTypeId", name: "Content Type ID", type: "Symbol", required: true, localized: false },
      { id: "schemaType", name: "Schema Type", type: "Symbol", required: true, localized: false },
      { id: "jsonLd", name: "JSON-LD", type: "Text", required: true, localized: false },
      { id: "updatedAt", name: "Updated At", type: "Date", required: false, localized: false }
    ]
  },
  dataLayerScript: {
    name: "Data Layer Script",
    description: "GA4 dataLayer.push scripts per Contentful content type (OmniTrack).",
    displayField: "contentTypeId",
    fields: [
      { id: "contentTypeId", name: "Content Type ID", type: "Symbol", required: true, localized: false },
      { id: "scriptCode", name: "Script Code", type: "Text", required: true, localized: false },
      { id: "events", name: "GA4 Events", type: "Array", items: { type: "Symbol" }, required: false, localized: false },
      { id: "updatedAt", name: "Updated At", type: "Date", required: false, localized: false }
    ]
  }
};

app.post("/api/contentful/bootstrap", async (req, res) => {
  const { spaceId, cmaToken, environment } = req.body;
  if (!spaceId || !cmaToken) return res.status(400).json({ error: "spaceId and cmaToken are required" });
  const env = environment || "master";
  const base = `https://api.contentful.com/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(env)}`;
  const authHeaders = {
    "Authorization": `Bearer ${cmaToken}`,
    "Content-Type": "application/vnd.contentful.management.v1+json"
  };
  const results = [];
  try {
    for (const [id, model] of Object.entries(CONTENT_MODELS)) {
      const step = { id, created: false, published: false, skipped: false, error: null };
      try {
        const getRes = await fetch(`${base}/content_types/${id}`, { headers: authHeaders });
        let version = 0;
        let exists = false;
        if (getRes.ok) {
          const body = await getRes.json();
          version = body.sys?.version || 0;
          exists = true;
        }
        const putRes = await fetch(`${base}/content_types/${id}`, {
          method: "PUT",
          headers: { ...authHeaders, ...(exists ? { "X-Contentful-Version": String(version) } : {}) },
          body: JSON.stringify(model)
        });
        if (!putRes.ok) {
          step.error = `${putRes.status} ${await putRes.text()}`;
          results.push(step);
          continue;
        }
        const putBody = await putRes.json();
        step.created = !exists;
        step.skipped = exists;
        const newVersion = putBody.sys?.version || 1;
        const pubRes = await fetch(`${base}/content_types/${id}/published`, {
          method: "PUT",
          headers: { ...authHeaders, "X-Contentful-Version": String(newVersion) }
        });
        step.published = pubRes.ok;
        if (!pubRes.ok) step.error = `publish ${pubRes.status}: ${await pubRes.text()}`;
      } catch (e) {
        step.error = e.message;
      }
      results.push(step);
    }
    const allOk = results.every(r => r.published && !r.error);
    res.json({ success: allOk, environment: env, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scan Contentful space for global/layout/settings models with injection-point fields
app.post("/api/contentful/scan-globals", async (req, res) => {
  const { spaceId, cdaToken, environment } = req.body;
  if (!spaceId || !cdaToken) return res.status(400).json({ error: "spaceId and cdaToken are required" });
  const env = environment || "master";
  const base = `https://cdn.contentful.com/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(env)}`;
  try {
    const ctRes = await fetch(`${base}/content_types?access_token=${encodeURIComponent(cdaToken)}&limit=200`);
    if (!ctRes.ok) return res.status(ctRes.status).json({ error: `CDA error ${ctRes.status}` });
    const ctData = await ctRes.json();
    const types = ctData.items || [];

    const GLOBAL_NAME_HINTS = /^(site|global|layout|config|settings|tracking|analytics|seo|header|footer|meta|head|scripts?|injection)/i;
    const FIELD_NAME_HINTS = /(head|script|tracking|analytics|gtm|ga4|gsc|verif|metatag|meta.?tag|schema|jsonld|custom.?head|body.?snippet|snippet|inject|tag|seo)/i;

    const candidates = types.map(ct => {
      const nameScore = GLOBAL_NAME_HINTS.test(ct.sys.id) || GLOBAL_NAME_HINTS.test(ct.name) ? 3 : 0;
      const fieldMatches = (ct.fields || []).filter(f =>
        (f.type === "Text" || f.type === "Symbol" || f.type === "Object") &&
        FIELD_NAME_HINTS.test(f.id + " " + (f.name || ""))
      );
      const fieldScore = fieldMatches.length * 2;
      const total = nameScore + fieldScore;
      return {
        contentTypeId: ct.sys.id,
        name: ct.name,
        description: ct.description || "",
        totalFields: (ct.fields || []).length,
        matchedFields: fieldMatches.map(f => ({ id: f.id, name: f.name, type: f.type })),
        score: total,
        verdict: total >= 5 ? "strong" : total >= 2 ? "possible" : "none"
      };
    }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);

    const strong = candidates.filter(c => c.verdict === "strong");
    let sampleEntries = [];
    if (strong.length > 0) {
      const top = strong[0];
      const eRes = await fetch(`${base}/entries?access_token=${encodeURIComponent(cdaToken)}&content_type=${encodeURIComponent(top.contentTypeId)}&limit=3`);
      if (eRes.ok) {
        const eData = await eRes.json();
        sampleEntries = (eData.items || []).map(e => ({ id: e.sys.id, fields: Object.keys(e.fields || {}) }));
      }
    }

    const yoloPossible = strong.length > 0;
    const recommendation = yoloPossible
      ? `YOLO possible \u2014 inject directly into "${strong[0].contentTypeId}" field(s): ${strong[0].matchedFields.map(f => f.id).join(", ")}`
      : candidates.length > 0
        ? "Possible candidates found but no strong injection point \u2014 may require one-time model addition"
        : "No global/settings/tracking content type found \u2014 one-time SiteSettings model creation recommended";

    res.json({
      success: true,
      spaceId,
      environment: env,
      totalContentTypes: types.length,
      yoloPossible,
      recommendation,
      topCandidate: strong[0] || null,
      sampleEntries,
      candidates
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy: Contentful CDA - fetch content types
app.get("/api/contentful/content-types", async (req, res) => {
  const { spaceId, cdaToken } = req.query;
  if (!spaceId || !cdaToken) {
    return res.status(400).json({ error: "spaceId and cdaToken are required" });
  }

  try {
    const url = `https://cdn.contentful.com/spaces/${encodeURIComponent(spaceId)}/content_types?access_token=${encodeURIComponent(cdaToken)}&limit=200`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Contentful CDA error: ${response.status}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate CMA token: hits Contentful /spaces/{id} with token. Returns auth status + space info or precise error.
app.post("/api/contentful/validate-cma", async (req, res) => {
  let { spaceId, cmaToken } = req.body;
  if (!spaceId || !cmaToken) {
    return res.status(400).json({ valid: false, error: "spaceId and cmaToken are required" });
  }
  // Trim whitespace/newlines from paste artifacts
  const rawTokenLength = cmaToken.length;
  spaceId = String(spaceId).trim();
  cmaToken = String(cmaToken).trim().replace(/[\r\n\t ]/g, "");
  const trimmed = rawTokenLength !== cmaToken.length;

  // Detect token type
  const tokenLooksLikePAT = cmaToken.startsWith("CFPAT-");
  const tokenLooksLikeCDA = !tokenLooksLikePAT && cmaToken.length > 30 && /^[A-Za-z0-9_-]+$/.test(cmaToken);

  try {
    const r = await fetch(`https://api.contentful.com/spaces/${encodeURIComponent(spaceId)}`, {
      headers: { "Authorization": `Bearer ${cmaToken}` }
    });

    if (r.status === 401) {
      // Parse Contentful error body for specific error ID
      let cfErrorId = null;
      let cfMessage = null;
      try {
        const body = await r.clone().json();
        cfErrorId = body.sys?.id;
        cfMessage = body.message;
      } catch {}

      let message;
      let reason = "unauthorized";
      if (cfErrorId === "OrganizationAccessGrantRequired") {
        reason = "org_grant_required";
        message = `Token valid, but NOT authorized for the organization that owns space '${spaceId}'. Fix: go to https://app.contentful.com/account/profile/cma_tokens → click Authorize button next to your token → grant access to the Credo org.`;
      } else if (tokenLooksLikePAT) {
        message = `PAT format detected (CFPAT-) but rejected. Contentful says: "${cfMessage || "Unauthorized"}". Likely cause: token revoked, expired, or org grant missing. Token tail: ...${cmaToken.slice(-6)}`;
      } else if (tokenLooksLikeCDA) {
        message = "Token format does NOT match Personal Access Token (CFPAT-... prefix expected). Likely pasted CDA or CPA. Get a PAT at https://app.contentful.com/account/profile/cma_tokens";
      } else {
        message = "Token rejected by Contentful. Verify it starts with 'CFPAT-' and is from Account → CMA tokens (not Space → API keys).";
      }
      return res.json({
        valid: false,
        status: 401,
        reason,
        message,
        contentfulErrorId: cfErrorId,
        contentfulMessage: cfMessage,
        tokenFormat: tokenLooksLikePAT ? "pat" : tokenLooksLikeCDA ? "cda_or_cpa" : "unknown",
        whitespaceTrimmed: trimmed
      });
    }
    if (r.status === 404) {
      return res.json({
        valid: false,
        status: 404,
        reason: "space_not_found",
        message: `Space '${spaceId}' not found or token has no access to it.`
      });
    }
    if (!r.ok) {
      const text = await r.text();
      return res.json({ valid: false, status: r.status, reason: "contentful_error", message: text.slice(0, 300) });
    }

    const space = await r.json();

    // Also test write capability — list content types (read scope minimum)
    let writeCapable = false;
    let dataLayerScriptModelExists = false;
    try {
      const ctRes = await fetch(`https://api.contentful.com/spaces/${encodeURIComponent(spaceId)}/environments/master/content_types`, {
        headers: { "Authorization": `Bearer ${cmaToken}` }
      });
      if (ctRes.ok) {
        writeCapable = true; // CMA endpoint reachable + token has access; entries POST should work
        const ctData = await ctRes.json();
        dataLayerScriptModelExists = (ctData.items || []).some(ct => ct.sys?.id === "dataLayerScript");
      }
    } catch {}

    res.json({
      valid: true,
      status: 200,
      space: { id: space.sys?.id, name: space.name, organizationId: space.sys?.organization?.sys?.id },
      writeCapable,
      dataLayerScriptModelExists,
      bootstrapNeeded: !dataLayerScriptModelExists
    });
  } catch (err) {
    res.status(500).json({ valid: false, reason: "network", message: err.message });
  }
});

// Proxy: Contentful CMA - inject script entry
app.post("/api/contentful/inject", async (req, res) => {
  let { spaceId, cmaToken, contentTypeId, scriptCode, events } = req.body;
  if (!spaceId || !cmaToken) {
    return res.status(400).json({ error: "spaceId and cmaToken are required" });
  }
  spaceId = String(spaceId).trim();
  cmaToken = String(cmaToken).trim().replace(/[\r\n\t ]/g, "");

  try {
    const response = await fetch(`https://api.contentful.com/spaces/${encodeURIComponent(spaceId)}/entries`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cmaToken}`,
        "Content-Type": "application/vnd.contentful.management.v1+json",
        "X-Contentful-Content-Type": "dataLayerScript"
      },
      body: JSON.stringify({
        fields: {
          contentTypeId: { "en-US": contentTypeId },
          scriptCode: { "en-US": scriptCode },
          events: { "en-US": events || [] },
          updatedAt: { "en-US": new Date().toISOString() }
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      appendInjection({
        type: "dataLayerScript",
        spaceId,
        entryId: data.sys?.id,
        contentTypeId,
        events: events || [],
        scriptCode,
        scriptLength: (scriptCode || "").length,
        success: true
      });
      res.json({ success: true, entryId: data.sys?.id });
    } else {
      const errorText = await response.text();
      appendInjection({
        type: "dataLayerScript",
        spaceId,
        contentTypeId,
        events: events || [],
        scriptLength: (scriptCode || "").length,
        success: false,
        error: `${response.status}: ${errorText.slice(0, 300)}`
      });
      res.status(response.status).json({ error: errorText });
    }
  } catch (err) {
    appendInjection({
      type: "dataLayerScript",
      spaceId,
      contentTypeId,
      success: false,
      error: err.message
    });
    res.status(500).json({ error: err.message });
  }
});

// Fetch entries of a content type
app.get("/api/contentful/entries", async (req, res) => {
  const { spaceId, cdaToken, contentTypeId, limit } = req.query;
  if (!spaceId || !cdaToken) {
    return res.status(400).json({ error: "spaceId and cdaToken are required" });
  }
  try {
    const qs = new URLSearchParams({ access_token: cdaToken, limit: limit || "25" });
    if (contentTypeId) qs.set("content_type", contentTypeId);
    const url = `https://cdn.contentful.com/spaces/${encodeURIComponent(spaceId)}/entries?${qs.toString()}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `Contentful CDA error: ${r.status}` });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Injection history — aggregates all OmniTrack-created entries across 3 content types
app.get("/api/contentful/history", async (req, res) => {
  const { spaceId, cdaToken, environment, limit } = req.query;
  if (!spaceId || !cdaToken) {
    return res.status(400).json({ error: "spaceId and cdaToken are required" });
  }
  const env = environment || "master";
  const cap = parseInt(limit || "200", 10);
  const base = `https://cdn.contentful.com/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(env)}`;

  const types = ["dataLayerScript", "headSnippet", "seoSchema"];
  try {
    const results = await Promise.all(types.map(async (ct) => {
      const url = `${base}/entries?access_token=${encodeURIComponent(cdaToken)}&content_type=${ct}&limit=${cap}&order=-sys.createdAt`;
      const r = await fetch(url);
      if (!r.ok) return { contentType: ct, items: [], error: `HTTP ${r.status}` };
      const data = await r.json();
      return { contentType: ct, items: data.items || [], total: data.total };
    }));

    const flat = [];
    for (const group of results) {
      for (const item of group.items) {
        const fields = item.fields || {};
        // CDA only returns published entries — strips publishedAt field for security.
        // If item appears in CDA response, it IS published.
        flat.push({
          entryId: item.sys.id,
          contentType: group.contentType,
          contentTypeId: fields.contentTypeId || fields.toolType || fields.schemaType || "—",
          createdAt: item.sys.createdAt,
          updatedAt: item.sys.updatedAt,
          publishedAt: item.sys.publishedAt || item.sys.updatedAt,
          isPublished: true,
          events: fields.events || [],
          scriptLength: (fields.scriptCode || fields.code || fields.jsonLd || "").length,
          identifier: fields.identifier || fields.sourceEntryId || null,
          preview: (fields.scriptCode || fields.code || fields.jsonLd || "").slice(0, 200)
        });
      }
    }

    flat.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const summary = {
      total: flat.length,
      byContentType: results.reduce((acc, g) => ({ ...acc, [g.contentType]: g.items.length }), {}),
      published: flat.filter(e => e.isPublished).length,
      drafts: flat.filter(e => !e.isPublished).length,
      errors: results.filter(g => g.error).map(g => ({ contentType: g.contentType, error: g.error }))
    };

    res.json({ success: true, summary, entries: flat });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get full entry detail (used to fetch script body on demand)
app.get("/api/contentful/entry/:id", async (req, res) => {
  const { id } = req.params;
  const { spaceId, cdaToken, environment } = req.query;
  if (!spaceId || !cdaToken) {
    return res.status(400).json({ error: "spaceId and cdaToken are required" });
  }
  const env = environment || "master";
  try {
    const url = `https://cdn.contentful.com/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(env)}/entries/${encodeURIComponent(id)}?access_token=${encodeURIComponent(cdaToken)}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `HTTP ${r.status}` });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generic head-snippet inject (GA4 / GTM / GSC)
app.post("/api/contentful/inject-head", async (req, res) => {
  const { spaceId, cmaToken, toolType, identifier, code } = req.body;
  if (!spaceId || !cmaToken) {
    return res.status(400).json({ error: "spaceId and cmaToken are required" });
  }
  try {
    const r = await fetch(`https://api.contentful.com/spaces/${encodeURIComponent(spaceId)}/entries`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cmaToken}`,
        "Content-Type": "application/vnd.contentful.management.v1+json",
        "X-Contentful-Content-Type": "headSnippet"
      },
      body: JSON.stringify({
        fields: {
          toolType: { "en-US": toolType },
          identifier: { "en-US": identifier || "" },
          code: { "en-US": code },
          updatedAt: { "en-US": new Date().toISOString() }
        }
      })
    });
    if (r.ok) {
      const d = await r.json();
      appendInjection({
        type: "headSnippet",
        spaceId,
        entryId: d.sys?.id,
        toolType,
        identifier: identifier || "",
        scriptCode: code,
        scriptLength: (code || "").length,
        success: true
      });
      res.json({ success: true, entryId: d.sys?.id });
    } else {
      const errorText = await r.text();
      appendInjection({
        type: "headSnippet",
        spaceId,
        toolType,
        identifier: identifier || "",
        scriptLength: (code || "").length,
        success: false,
        error: `${r.status}: ${errorText.slice(0, 300)}`
      });
      res.status(r.status).json({ error: errorText });
    }
  } catch (err) {
    appendInjection({ type: "headSnippet", spaceId, toolType, success: false, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// JSON-LD schema inject back as seoSchema entry linked to source entry
app.post("/api/contentful/inject-schema", async (req, res) => {
  const { spaceId, cmaToken, entryId, contentTypeId, schemaType, jsonLd } = req.body;
  if (!spaceId || !cmaToken) {
    return res.status(400).json({ error: "spaceId and cmaToken are required" });
  }
  try {
    const r = await fetch(`https://api.contentful.com/spaces/${encodeURIComponent(spaceId)}/entries`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cmaToken}`,
        "Content-Type": "application/vnd.contentful.management.v1+json",
        "X-Contentful-Content-Type": "seoSchema"
      },
      body: JSON.stringify({
        fields: {
          sourceEntryId: { "en-US": entryId || "" },
          contentTypeId: { "en-US": contentTypeId || "" },
          schemaType: { "en-US": schemaType || "Thing" },
          jsonLd: { "en-US": typeof jsonLd === "string" ? jsonLd : JSON.stringify(jsonLd) },
          updatedAt: { "en-US": new Date().toISOString() }
        }
      })
    });
    if (r.ok) {
      const d = await r.json();
      appendInjection({
        type: "seoSchema",
        spaceId,
        entryId: d.sys?.id,
        contentTypeId: contentTypeId || "",
        sourceEntryId: entryId || "",
        schemaType: schemaType || "Thing",
        scriptCode: typeof jsonLd === "string" ? jsonLd : JSON.stringify(jsonLd),
        scriptLength: (typeof jsonLd === "string" ? jsonLd : JSON.stringify(jsonLd) || "").length,
        success: true
      });
      res.json({ success: true, entryId: d.sys?.id });
    } else {
      const errorText = await r.text();
      appendInjection({
        type: "seoSchema",
        spaceId,
        contentTypeId: contentTypeId || "",
        schemaType: schemaType || "Thing",
        success: false,
        error: `${r.status}: ${errorText.slice(0, 300)}`
      });
      res.status(r.status).json({ error: errorText });
    }
  } catch (err) {
    appendInjection({ type: "seoSchema", spaceId, success: false, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Injection log — local audit trail (no Contentful round-trip)
app.get("/api/injection-log", (req, res) => {
  const limit = parseInt(req.query.limit || "500", 10);
  const items = readInjections({ limit });
  res.json({
    success: true,
    summary: getStats(),
    entries: items
  });
});

app.delete("/api/injection-log", (_req, res) => {
  const ok = clearLog();
  res.json({ success: ok });
});

// Backfill: import existing Contentful entries into local log (one-time sync)
app.post("/api/injection-log/backfill", async (req, res) => {
  const { spaceId, cdaToken, environment } = req.body;
  if (!spaceId || !cdaToken) return res.status(400).json({ error: "spaceId and cdaToken required" });
  const env = environment || "master";
  const base = `https://cdn.contentful.com/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(env)}`;
  const types = ["dataLayerScript", "headSnippet", "seoSchema"];

  // Avoid duplicating existing log entries — index by entryId
  const existing = readInjections();
  const existingIds = new Set(existing.map(e => e.entryId).filter(Boolean));

  let imported = 0;
  const errors = [];

  try {
    for (const ct of types) {
      const url = `${base}/entries?access_token=${encodeURIComponent(cdaToken)}&content_type=${ct}&limit=200&order=sys.createdAt`;
      const r = await fetch(url);
      if (!r.ok) { errors.push({ ct, status: r.status }); continue; }
      const data = await r.json();
      for (const item of (data.items || [])) {
        if (existingIds.has(item.sys.id)) continue;
        const f = item.fields || {};
        appendInjection({
          type: ct,
          spaceId,
          entryId: item.sys.id,
          contentTypeId: f.contentTypeId || f.toolType || f.schemaType || "",
          toolType: f.toolType,
          schemaType: f.schemaType,
          identifier: f.identifier || f.sourceEntryId || "",
          events: f.events || [],
          scriptCode: f.scriptCode || f.code || f.jsonLd || "",
          scriptLength: (f.scriptCode || f.code || f.jsonLd || "").length,
          success: true,
          backfilled: true,
          originalCreatedAt: item.sys.createdAt
        });
        imported++;
      }
    }
    res.json({ success: true, imported, skipped: existingIds.size, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Website scanner: discover sitemap.xml and return URL list
app.post("/api/website/discover-sitemap", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });
  try {
    const out = await discoverSitemap(url);
    res.json({ success: true, ...out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Website scanner: scan a single page
app.post("/api/website/scan-page", async (req, res) => {
  const { url, usePlaywright, autoFallback } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });
  try {
    const out = await scanPage(url, { usePlaywright, autoFallback });
    res.json({ success: true, ...out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Website scanner: scan multiple pages and aggregate
app.post("/api/website/scan-batch", async (req, res) => {
  const { urls, usePlaywright, autoFallback } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "urls array is required" });
  }
  try {
    const out = await scanPages(urls, null, { usePlaywright, autoFallback });
    res.json({ success: true, ...out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Capability check
app.get("/api/website/capabilities", async (_req, res) => {
  res.json({
    playwrightAvailable: await isPlaywrightAvailable(),
    aiAvailable: !!process.env.ANTHROPIC_API_KEY,
    aiModel: "claude-haiku-4-5-20251001",
    omnibotAvailable: !!process.env.OMNIBOT_ENDPOINT,
    maxPages: 50,
    maxInteractionsPerPage: 200
  });
});

// Tier 3: AI Agent scan (Claude Haiku classifies elements with semantic intent)
app.post("/api/website/scan-ai", async (req, res) => {
  const { urls, apiKey, useChromium } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "urls array required" });
  }
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(400).json({ error: "ANTHROPIC_API_KEY not set on server and none provided in request" });

  let browser = null;
  let context = null;
  try {
    if (useChromium) {
      try {
        const pw = await import("playwright");
        browser = await pw.chromium.launch({ headless: true });
        context = await browser.newContext({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36"
        });
      } catch (e) {
        browser = null; context = null;
      }
    }

    const fetchHtml = async (u) => {
      if (context) {
        const page = await context.newPage();
        try {
          await page.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 });
          // Settle: wait for body + brief idle for SPA hydration
          await page.waitForLoadState("load", { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(1500);
          return await page.content();
        } finally {
          await page.close().catch(() => {});
        }
      }
      const r = await fetchWithTimeout(u);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    };

    const out = await classifyPages(urls, fetchHtml, { apiKey: key });
    res.json({ success: true, ...out, engineUsed: context ? "chromium+ai" : "fetch+ai" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
});

// Tier 4: OmniBot stub (real integration pending — set OMNIBOT_ENDPOINT env var)
app.post("/api/website/scan-omnibot", async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "urls array required" });
  }
  const endpoint = process.env.OMNIBOT_ENDPOINT;
  if (!endpoint) {
    return res.status(501).json({
      error: "OmniBot integration pending",
      message: "Set OMNIBOT_ENDPOINT env var (and OMNIBOT_API_KEY if needed) to enable Tier 4 deep crawl. For now use AI Agent tier.",
      stub: true,
      requestedUrls: urls.length
    });
  }
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.OMNIBOT_API_KEY ? { "Authorization": `Bearer ${process.env.OMNIBOT_API_KEY}` } : {})
      },
      body: JSON.stringify({ urls })
    });
    if (!r.ok) return res.status(r.status).json({ error: `OmniBot returned ${r.status}` });
    const data = await r.json();
    res.json({ success: true, engine: "omnibot", ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear AI cache (for testing / re-classifying)
app.post("/api/website/clear-ai-cache", (_req, res) => {
  clearAiCache();
  res.json({ success: true });
});

// SPA fallback - serve index.html for all non-API routes
app.get("/{*path}", (_req, res) => {
  res.sendFile(join(__dirname, "../dist/index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`OmniTrack Data Layer Studio running on port ${PORT}`);
});
