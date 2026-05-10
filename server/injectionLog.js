import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "..", "data");
const LOG_FILE = path.join(LOG_DIR, "injection-log.jsonl");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function appendInjection(record) {
  try {
    ensureLogDir();
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...record
    }) + "\n";
    fs.appendFileSync(LOG_FILE, line, "utf8");
    return true;
  } catch (e) {
    console.error("[injectionLog] append failed:", e.message);
    return false;
  }
}

export function readInjections(opts = {}) {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const raw = fs.readFileSync(LOG_FILE, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const items = [];
    for (const line of lines) {
      try { items.push(JSON.parse(line)); } catch {}
    }
    items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    if (opts.limit) return items.slice(0, opts.limit);
    return items;
  } catch (e) {
    console.error("[injectionLog] read failed:", e.message);
    return [];
  }
}

export function clearLog() {
  try {
    if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
    return true;
  } catch { return false; }
}

export function getStats() {
  const items = readInjections();
  const byType = {};
  let totalChars = 0;
  for (const it of items) {
    byType[it.type] = (byType[it.type] || 0) + 1;
    totalChars += (it.scriptCode || "").length;
  }
  return {
    total: items.length,
    byType,
    totalChars,
    firstAt: items.length ? items[items.length - 1].ts : null,
    lastAt: items.length ? items[0].ts : null
  };
}
