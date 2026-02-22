// api/webhook.js (Vercel – Node.js CJS)
const fs = require("fs");
const path = require("path");

// =====================
// 1) KB เดิม (Q/A)
// =====================
let KB_ITEMS = [];
let KB_ERROR = null;

function loadKB() {
  try {
    const kbPath = path.join(process.cwd(), "kb_multi_3lang.json");
    const raw = fs.readFileSync(kbPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) {
      throw new Error("Invalid KB format: missing `items` array");
    }
    KB_ITEMS = parsed.items;
    KB_ERROR = null;
    console.log(`[webhook] KB loaded: ${KB_ITEMS.length} items from ${kbPath}`);
  } catch (err) {
    KB_ERROR = err;
    KB_ITEMS = [];
    console.error("[webhook] Failed to load KB:", err);
  }
}
loadKB();

// =====================
// 2) Document DB (GitHub raw)
// =====================
const DOCS_RAW_URL =
  "https://raw.githubusercontent.com/nongkaohom-bot/vercel/refs/heads/main/document.json";

// cache กันยิงถี่
let DOCS_CACHE = null;
let DOCS_CACHE_AT = 0;
const DOCS_TTL_MS = 60 * 1000; // 60s

async function loadDocs() {
  const now = Date.now();
  if (DOCS_CACHE && now - DOCS_CACHE_AT < DOCS_TTL_MS) return DOCS_CACHE;

  const r = await fetch(DOCS_RAW_URL);
  if (!r.ok) throw new Error(`Failed to fetch document.json: ${r.status} ${r.statusText}`);
  const docs = await r.json();
  if (!Array.isArray(docs)) throw new Error("Invalid document.json format: expected array");

  DOCS_CACHE = docs;
  DOCS_CACHE_AT = now;
  return docs;
}

// =====================
// Helpers
// =====================
function detectLang(text = "") {
  if (/[\u3040-\u30FF\u3400-\u9FFF]/.test(text)) return "ja";
  if (/[a-zA-Z]/.test(text)) return "en";
  return "th";
}
function norm(s = "") {
  return String(s).trim().toLowerCase();
}

// ค้น KB เดิม (Q/A)
function findKBItemByQuery(query) {
  const q = norm(query);
  let best = null;
  for (const it of KB_ITEMS) {
    const cands = [it?.q?.th, it?.q?.en, it?.q?.ja].filter(Boolean);
    for (const c of cands) {
      const cl = norm(c);
      const score = cl.includes(q) || q.includes(cl) ? cl.length : 0;
      if (score > (best?.score || 0)) best = { item: it, score };
    }
  }
  return best?.item || null;
}

// ค้นไฟล์จาก docs (match key หรือ keywords)
function findDocByQuery(docs, query) {
  const q = norm(query);
  return docs.find((d) => {
    const key = norm(d?.key);
    const kws = Array.isArray(d?.keywords) ? d.keywords.map(norm) : [];
    return q === key || kws.some((k) => k && q.includes(k));
  }) || null;
}

// =====================
// Handler
// =====================
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    const body = req.body || {};
    const queryText = body?.queryResult?.queryText || "";
    const intentDisplayName = body?.queryResult?.intent?.displayName || "";
    const lang = detectLang(queryText);

    // -------------------------
    // A) Intent: Request_file -> ค้น document.json แล้วตอบลิงก์
    // -------------------------
    if (intentDisplayName === "Request_file") {
      const docs = await loadDocs();
      const found = findDocByQuery(docs, queryText);

      if (found) {
        return res.status(200).json({
          fulfillmentText: `ได้เลย ✅ นี่คือ ${found.title}\n${found.url}`
        });
      }

      // ไม่เจอ -> แสดงรายการที่มี
      const list = docs.map((d) => `- ${d.title} (พิมพ์: ${d.key})`).join("\n");
      return res.status(200).json({
        fulfillmentText:
          `ยังไม่เจอไฟล์ที่ตรงกับ "${queryText}"\n` +
          `ลองพิมพ์คีย์ให้ชัดขึ้น เช่น "ขอไฟล์ a"\n` +
          `หรือเลือกจากรายการนี้:\n${list}`
      });
    }

    // -------------------------
    // B) Intent อื่น ๆ -> ใช้ KB เดิม
    // -------------------------
    if (KB_ERROR) {
      return res.status(500).json({
        fulfillmentText:
          "KB not loaded on server. Please check kb_multi_3lang.json exists at project root.",
        error: String(KB_ERROR)
      });
    }

    // 1) ลองจับด้วยชื่อ intent (กรณีตั้ง displayName = ข้อความไทย)
    let hit = null;
    if (intentDisplayName) {
      const name = intentDisplayName.replace(/^\[[^\]]+\]\s*/, "").trim();
      hit = KB_ITEMS.find((it) => it?.q?.th === name);
    }

    // 2) ถ้าไม่เจอ ใช้ fuzzy จาก query
    if (!hit) hit = findKBItemByQuery(queryText);

    if (!hit) {
      const fallback = {
        th: "ขอรายละเอียดเพิ่มเติม เพื่อช่วยค้นหาคำตอบให้ตรงขึ้นครับ/ค่ะ",
        en: "Please provide a bit more detail so I can answer precisely.",
        ja: "より正確に回答するため、もう少し詳細を教えてください。"
      };
      return res.status(200).json({ fulfillmentText: fallback[lang] || fallback.en });
    }

    const answer = hit?.a?.[lang] || hit?.a?.en || hit?.a?.th || "No answer available.";
    return res.status(200).json({ fulfillmentText: answer });

  } catch (err) {
    console.error("[webhook] Uncaught error:", err);
    return res.status(500).json({
      fulfillmentText: "Webhook error.",
      error: String(err)
    });
  }
};
