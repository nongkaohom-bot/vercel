// api/webhook.js (Vercel – Node.js CJS)
const fs = require("fs");
const path = require("path");

// -------- Load KB (safe) --------
let KB_ITEMS = [];
let KB_ERROR = null;

function loadKB() {
  try {
    // ชี้ไปที่ไฟล์ใน "root ของโปรเจกต์" ชื่อ kb_multi_3lang.json
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
loadKB(); // โหลดครั้งแรกตอน start

// -------- Helpers --------
function detectLang(text = "") {
  if (/[\u3040-\u30FF\u3400-\u9FFF]/.test(text)) return "ja"; // jp
  if (/[a-zA-Z]/.test(text)) return "en";                    // en
  return "th";                                               // default th
}

function norm(s = "") {
  return String(s).trim().toLowerCase();
}

// ค้นหาแบบง่าย: contains + ลองทุกภาษา
function findItemByQuery(query) {
  const q = norm(query);
  let best = null;
  for (const it of KB_ITEMS) {
    const cands = [
      it?.q?.th, it?.q?.en, it?.q?.ja
    ].filter(Boolean);
    for (const c of cands) {
      const cl = norm(c);
      const score = cl.includes(q) || q.includes(cl) ? cl.length : 0;
      if (score > (best?.score || 0)) best = { item: it, score };
    }
  }
  return best?.item || null;
}

// -------- Handler --------
module.exports = (req, res) => {
  // ป้องกันการเปิดด้วย GET ในเบราว์เซอร์
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    // ถ้าโหลด KB ไม่สำเร็จ ให้ตอบ error ที่อ่านง่าย
    if (KB_ERROR) {
      return res.status(500).json({
        fulfillmentText:
          "KB not loaded on server. Please check kb_multi_3lang.json exists at project root.",
        error: String(KB_ERROR)
      });
    }

    const body = req.body || {};
    const queryText = body?.queryResult?.queryText || "";
    const intentDisplayName = body?.queryResult?.intent?.displayName || "";
    const lang = detectLang(queryText);

    // 1) ลองจับด้วยชื่อ intent (กรณีคุณตั้ง displayName = ข้อความไทย)
    let hit = null;
    if (intentDisplayName) {
      const name = intentDisplayName.replace(/^\[[^\]]+\]\s*/, "").trim();
      hit = KB_ITEMS.find(it => it?.q?.th === name);
    }

    // 2) ถ้าไม่เจอ ใช้ fuzzy contains จาก query
    if (!hit) hit = findItemByQuery(queryText);

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
    return res.status(500).json({ fulfillmentText: "Webhook error.", error: String(err) });
  }
};
