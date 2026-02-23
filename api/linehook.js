// api/linehook.js - temporary endpoint to capture groupId
const crypto = require("crypto");

function verifyLineSignature(req, channelSecret) {
  const signature = req.headers["x-line-signature"];
  if (!signature) return false;

  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  const hash = crypto
    .createHmac("sha256", channelSecret)
    .update(body)
    .digest("base64");

  return hash === signature;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Use POST");

  // สำคัญ: ต้องตั้ง env ใน Vercel ชื่อ LINE_CHANNEL_SECRET
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    console.log("Missing LINE_CHANNEL_SECRET in env");
    return res.status(500).send("Missing LINE_CHANNEL_SECRET");
  }

  // Vercel บางครั้งแปลง body เป็น object แล้ว — เรา verify แบบง่าย ๆ
  // ถ้า verify ไม่ผ่านก็ยัง log ให้ดูได้ (เพื่อจับ groupId ก่อน)
  const ok = verifyLineSignature(req, secret);
  console.log("Signature valid?", ok);

  console.log("LINE EVENT BODY:", JSON.stringify(req.body, null, 2));

  return res.status(200).json({ ok: true });
};
