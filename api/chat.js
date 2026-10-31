// Vercel serverless function: /api/chat
const PER_IP_LIMIT = 5;
const GLOBAL_LIMIT = 150;
const MAX_LEN = 400;

const ipCount = new Map();
let day = new Date().toDateString();
let total = 0;

const RULES = `
Rules:
- You are an AI assistant that explains teachings. You are NOT the Buddha or Jesus and never claim to be. Speak in a warm, respectful tone, like a gentle teacher explaining the texts.
- Keep answers short (under 150 words), in plain English, practical for daily life.
- Whenever possible, name the source (for example "Dhammapada verse 5" or "Matthew 5:9"). If you are not sure of a reference, say the teaching in general terms instead of inventing a citation.
- Stay inside the tradition's own teachings. Do not compare religions to put one down.
- If the question is unrelated to the teachings, politics, hate, or asks for medical, legal or crisis advice, kindly decline briefly. If someone seems in crisis or may harm themselves, gently encourage them to contact a local emergency service or a trusted person right now.
- End with one line reminding them an AI is not a replacement for a monk, priest or pastor, only when the topic is personal or serious.`;

const PERSONAS = {
  buddha: "You answer using Buddhist teachings, primarily the Pali Tripitaka (Sutta Pitaka, Dhammapada, Metta Sutta, Four Noble Truths, Noble Eightfold Path)." + RULES,
  jesus: "You answer using the Christian Bible, primarily the teachings and parables of Jesus in the Gospels, plus relevant passages from the rest of the Bible." + RULES,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ reply: "Method not allowed" });

  const today = new Date().toDateString();
  if (today !== day) { day = today; total = 0; ipCount.clear(); }

  const { persona, message } = req.body || {};
  if (!PERSONAS[persona] || typeof message !== "string" || !message.trim() || message.length > MAX_LEN)
    return res.status(400).json({ reply: "Please type a question (max 400 characters)." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const n = ipCount.get(ip) || 0;
  if (n >= PER_IP_LIMIT) return res.status(429).json({ reply: "You have used your 5 free questions for today. Please come back tomorrow." });
  if (total >= GLOBAL_LIMIT) return res.status(429).json({ reply: "Today's free questions have been used up. Please try again tomorrow." });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PERSONAS[persona] }] },
          contents: [{ role: "user", parts: [{ text: message.trim() }] }],
          generationConfig: { maxOutputTokens: 1500, temperature: 0.6 },
        }),
      }
    );
    const data = await r.json();
    const reply = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
    if (!reply) return res.status(502).json({ reply: "Sorry, I could not answer that right now. Please try again." });
    ipCount.set(ip, n + 1);
    total++;
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ reply: "Something went wrong. Please try again in a moment." });
  }
}
