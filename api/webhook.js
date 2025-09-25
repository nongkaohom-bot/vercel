// api/webhook.js
const fs = require('fs');
const path = require('path');

// โหลดฐานความรู้ (JSON)
const kbPath = path.join(__dirname, '..', 'kb_multi_full_from_agent.json');
const kb = JSON.parse(fs.readFileSync(kbPath, 'utf8')).items;

// ฟังก์ชันตรวจภาษาแบบง่าย ๆ
function detectLang(text) {
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf]/.test(text)) return "ja"; // ญี่ปุ่น
  if (/[a-zA-Z]/.test(text)) return "en"; // อังกฤษ
  return "th"; // ไทย (default)
}

// ฟังก์ชันหาคำตอบ
function findAnswer(query, lang) {
  // ค้นหาแบบ contains
  for (let item of kb) {
    const q = item.q[lang] || "";
    if (q && query.includes(q.split(" ")[0])) {
      return item.a[lang] || item.a["th"];
    }
  }
  // ถ้าไม่เจอเลย return null
  return null;
}

// Handler ของ Vercel
module.exports = (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const queryText = req.body.queryResult?.queryText || "";
    const lang = detectLang(queryText);
    const answer = findAnswer(queryText, lang) || "ขออภัย ฉันไม่เข้าใจคำถามนี้";

    res.json({
      fulfillmentText: answer
    });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
