import { Router, Request, Response } from "express";

const router = Router();

// ── Conversation memory (last 6 messages per user) ────────────────────────────
const conversations = new Map<string, { role: "user" | "assistant"; content: string }[]>();
// ── New users tracking ────────────────────────────────────────────────────────
const seenUsers = new Set<string>();

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a friendly AI shopping assistant for TryIt4U — AI virtual try-on for fashion & home.

Key facts:
- Users upload a selfie and virtually try on ANY clothing, shoes, glasses, accessories from ANY store (ZARA, Nike, Amazon, ASOS, H&M, 500+ stores)
- Also: place ANY furniture/home product inside your home photo (IKEA, Wayfair, etc.)
- Works at tryit4u.ai (web app) and as a Chrome extension
- Pricing: Free (5 try-ons/month) | Pro $12.99/mo (50 try-ons) | Pro Plus $29.99/mo (unlimited)
- Sign up / waitlist: https://tryit4u.ai

Instructions:
- Be warm, concise (2-4 sentences), conversational
- Always reply in English
- Always end with a link or a clear next step
- If asked pricing, list all tiers clearly
- Never make up features that don't exist`;

// ── Welcome menu ──────────────────────────────────────────────────────────────
const WELCOME = `👋 *Welcome to TryIt4U!* I'm your AI shopping assistant.

Try on ANY outfit or place ANY furniture in your home — before you buy! 🛍️✨

*What can I help you with?*
1️⃣  How does TryIt4U work?
2️⃣  💰 Pricing & plans
3️⃣  📥 Get the Chrome extension
4️⃣  👗 Fashion try-on
5️⃣  🛋️ Home furniture preview
6️⃣  💬 Ask me anything

_Just reply with a number or type your question!_`;

// ── Quick reply shortcuts ─────────────────────────────────────────────────────
const QUICK_REPLIES: Record<string, string> = {
  "1": "TryIt4U works in 3 simple steps:\n1. Upload your photo (selfie or home)\n2. Browse any store and click the TryIt4U button\n3. See the product on YOU instantly ✨\n\nTry it now → https://tryit4u.ai",
  "2": "💰 *TryIt4U Pricing:*\n• *Free* — 5 try-ons/month\n• *Pro* — $12.99/mo (50 try-ons)\n• *Pro Plus* — $29.99/mo (unlimited ♾️)\n\nAll plans include fashion try-on + home furniture preview!\nSign up → https://tryit4u.ai",
  "3": "📥 *Chrome Extension:*\nInstall TryIt4U to get a try-on button on every product you browse — ZARA, Amazon, ASOS, IKEA and 500+ stores!\n\nGet it here → https://tryit4u.ai/#download",
  "4": "👗 *Fashion Try-On:*\nUpload a selfie → browse any clothing store → click our button → see the outfit on YOUR photo in seconds!\n\nWorks on tops, dresses, pants, shoes, glasses and more 😍\n\nStart free → https://tryit4u.ai",
  "5": "🛋️ *Home Furniture Preview:*\nUpload a photo of your home → browse IKEA, Wayfair, Amazon etc. → our AI places the furniture perfectly in your space with correct proportions!\n\nTry it free → https://tryit4u.ai",
};

// ── POST /whatsapp/webhook ────────────────────────────────────────────────────
router.post("/webhook", async (req: Request, res: Response) => {
  const twilioModule = await import("twilio");
  const twiml = new twilioModule.default.twiml.MessagingResponse();

  try {
    const incomingMsg = (req.body.Body as string || "").trim();
    const from = req.body.From as string;

    console.log(`[WhatsApp] ${from}: ${incomingMsg}`);

    // ── First-time user: show welcome menu ───────────────────────────────────
    if (!seenUsers.has(from)) {
      seenUsers.add(from);
      twiml.message(WELCOME);
      res.type("text/xml").send(twiml.toString());
      return;
    }

    // ── Quick reply: user typed a number 1-5 ────────────────────────────────
    const trimmed = incomingMsg.replace(/[.,!?]/g, "").trim();
    if (QUICK_REPLIES[trimmed]) {
      twiml.message(QUICK_REPLIES[trimmed]);
      res.type("text/xml").send(twiml.toString());
      return;
    }

    // ── AI response with conversation memory ─────────────────────────────────
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!incomingMsg || !openaiKey) {
      twiml.message("Hi! 👋 How can I help you with TryIt4U today?");
      res.type("text/xml").send(twiml.toString());
      return;
    }

    const history = conversations.get(from) || [];
    history.push({ role: "user", content: incomingMsg });
    if (history.length > 6) history.splice(0, history.length - 6);

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: openaiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
      ],
      max_tokens: 350,
      temperature: 0.7,
    });

    const aiResponse =
      completion.choices[0]?.message?.content ||
      "Thanks! Visit tryit4u.ai to learn more 🌟";

    history.push({ role: "assistant", content: aiResponse });
    conversations.set(from, history);

    twiml.message(aiResponse);
  } catch (err) {
    console.error("[WhatsApp] Bot error:", err);
    twiml.message("Hey! 👋 Visit tryit4u.ai to try on any outfit instantly ✨");
  }

  res.type("text/xml").send(twiml.toString());
});

// ── GET /whatsapp/webhook — Twilio verification ───────────────────────────────
router.get("/webhook", (_req: Request, res: Response) => {
  res.status(200).send("WhatsApp webhook active ✅");
});

export default router;
