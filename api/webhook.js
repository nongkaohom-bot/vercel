import fs from "fs";
import path from "path";

const kb = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "kb_multi.json"), "utf8")
).items;

function detectLang(text = "") {
  if (/[ぁ-んァ-ン一-龯]/.test(text)) return "ja";
  if (/[฀-\u0E7F]/.test(text)) return "th";
  return "en";
}

function norm(s = "") { return String(s).trim().toLowerCase(); }

function findAnswer(reqText, intentDisplayName) {
  const lang = detectLang(reqText);

  if (intentDisplayName) {
    const name = intentDisplayName.replace(/^\[[^\]]+\]\s*/, "").trim();
    const hit = kb.find(it => it.q?.th === name);
    if (hit) return { lang, item: hit };
  }

  const q = norm(reqText);
  let best = null;
  for (const it of kb) {
    const cand = [it.q?.[lang], it.q?.th, it.q?.en, it.q?.ja].filter(Boolean);
    for (const c of cand) {
      const cl = c.toLowerCase();
      const score = cl.includes(q) || q.includes(cl) ? cl.length : 0;
      if (score > (best?.score || 0)) best = { item: it, score };
    }
  }
  if (best) return { lang, item: best.item };
  return { lang, item: null };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }
    const body = req.body || {};
    const queryText = body?.queryResult?.queryText || "";
    const intentDisplayName = body?.queryResult?.intent?.displayName || "";

    const { lang, item } = findAnswer(queryText, intentDisplayName);

    if (!item) {
      const fallback = {
        th: "ขอรายละเอียดเพิ่มเติม (แผนก/ระบบ/รหัสเอกสาร) เพื่อหาคำตอบที่ตรงขึ้นครับ",
        en: "Please provide more details (department/system/document code).",
        ja: "より正確に回答するため、部署・システム・文書コードなどの詳細を教えてください。"
      };
      return res.status(200).json({ fulfillmentText: fallback[lang] || fallback.en });
    }

    const answer = item.a?.[lang] || item.a?.en || item.a?.th || "No answer found.";
    return res.status(200).json({ fulfillmentText: answer });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ fulfillmentText: "Webhook error." });
  }
}