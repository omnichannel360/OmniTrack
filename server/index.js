import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

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

// Proxy: Contentful CMA - inject script entry
app.post("/api/contentful/inject", async (req, res) => {
  const { spaceId, cmaToken, contentTypeId, scriptCode, events } = req.body;
  if (!spaceId || !cmaToken) {
    return res.status(400).json({ error: "spaceId and cmaToken are required" });
  }

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
      res.json({ success: true, entryId: data.sys?.id });
    } else {
      const errorText = await response.text();
      res.status(response.status).json({ error: errorText });
    }
  } catch (err) {
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
      res.json({ success: true, entryId: d.sys?.id });
    } else {
      res.status(r.status).json({ error: await r.text() });
    }
  } catch (err) {
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
      res.json({ success: true, entryId: d.sys?.id });
    } else {
      res.status(r.status).json({ error: await r.text() });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback - serve index.html for all non-API routes
app.get("/{*path}", (_req, res) => {
  res.sendFile(join(__dirname, "../dist/index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`OmniTrack Data Layer Studio running on port ${PORT}`);
});
