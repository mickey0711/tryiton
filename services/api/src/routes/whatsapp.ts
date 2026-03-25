import { Router, Request, Response } from "express";

const router = Router();

// ── Conversation memory (last 6 messages per user) ───────────────────────────
const conversations = new Map<string, { role: "user" | "assistant"; content: string }[]>();
// ── New users tracking ────────────────────────────────────────────────────────
const seenUsers = new Set<string>();

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a friendly AI shopping assistant for TryIt4U — AI virtual try-on for fashion & home.

Key facts:
- Users upload a selfie and virtually try on ANY clothing, shoes, glasses, accessories from ANY store (ZARA, Nike, Amazon, ASOS, H&M, 500+ stores)
- Also: place ANY furniture/home product inside your room photo (IKEA, Wayfair, etc.)
- Works at tryit4u.ai (web app) and as a Chrome extension
- Pricing: Free (5 try-ons/month) | Pro $12.99/mo (50 try-ons) | Pro Plus $29.99/mo (unlimited)
- Sign up / waitlist: https://tryit4u.ai

Instructions:
- Be warm, concise (2-4 sentences), conversational
- Reply in the SAME language the user writes in (Hebrew → Hebrew, English → English)
- Always end with a link or a clear next step
- If asked pricing, list all tiers clearly
- Never make up features that don't exist`;

// ── Welcome menu ──────────────────────────────────────────────────────────────
const WELCOME_EN = `👋 *Welcome to TryIt4U!* I'm your AI shopping assistant.

Try on ANY outfit or place ANY furniture in your room — before you buy! 🛍️✨

*What can I help you with?*
1️⃣  How does TryIt4U work?
2️⃣  💰 Pricing & plans
3️⃣  📥 Get the Chrome extension
4️⃣  👗 Fashion try-on
5️⃣  🛋️ Furniture room preview
6️⃣  💬 Ask me anything

_Just reply with a number or type your question!_`;

const WELCOME_HE = `👋 *ברוכים הבאים ל-TryIt4U!* אני העוזר החכם שלכם לקניות.

נסו כל בגד או רהיט על עצמכם — לפני שקונים! 🛍️✨

*במה אוכל לעזור?*
1️⃣  איך TryIt4U עובד?
2️⃣  💰 מחירים ותוכניות
3️⃣  📥 להורדת תוסף Chrome
4️⃣  👗 מדידת בגדים
5️⃣  🛋️ תצוגת ריהוט בחדר
6️⃣  💬 שאל אותי כל שאלה

_ענה במספר או פשוט כתב את השאלה שלך!_`;

// ── Keyword shortcuts ─────────────────────────────────────────────────────────
const QUICK_REPLIES: Record<string, string> = {
  "1": "TryIt4U works in 3 simple steps:\n1. Upload your photo (selfie or room)\n2. Browse any store and click the TryIt4U button\n3. See the product on YOU instantly ✨\n\nTry it now → https://tryit4u.ai",
  "2": "💰 *TryIt4U Pricing:*\n• *Free* — 5 try-ons/month\n• *Pro* — $12.99/mo (50 try-ons)\n• *Pro Plus* — $29.99/mo (unlimited ♾️)\n\nAll plans include fashion try-on + furniture room preview!\nSign up → https://tryit4u.ai",
  "3": "📥 *Chrome Extension:*\nInstall TryIt4U directly in Chrome to get a try-on button on every product you browse — ZARA, Amazon, ASOS, IKEA and 500+ stores!\n\nGet it here → https://tryit4u.ai/#download",
  "4": "👗 *Fashion Try-On:*\nUpload a selfie → browse any clothing store → click our button → see the outfit on YOUR photo in seconds! Works on tops, dresses, pants, shoes, glasses and more 😍\n\nStart free → https://tryit4u.ai",
  "5": "🛋️ *Furniture Room Preview:*\nUpload a photo of your room → browse IKEA, Wayfair, Amazon etc. → our AI places the furniture perfectly in your space with correct proportions!\n\nTry it free → https://tryit4u.ai",
};

const QUICK_REPLIES_HE: Record<string, string> = {
  "1": "TryIt4U עובד ב-3 שלבים פשוטים:\n1. העלאת תמונה (סלפי או חדר)\n2. גלישה בחנות כלשהי ולחיצה על כפתור TryIt4U\n3. רואים את המוצר עליך מיד ✨\n\nנסה עכשיו → https://tryit4u.ai",
  "2": "💰 *מחירי TryIt4U:*\n• *חינם* — 5 מדידות בחודש\n• *פרו* — $12.99 לחודש (50 מדידות)\n• *פרו פלוס* — $29.99 לחודש (ללא הגבלה ♾️)\n\nכל התוכניות כוללות אופנה + ריהוט!\nהירשם → https://tryit4u.ai",
  "3": "📥 *תוסף Chrome:*\nהתקן את TryIt4U ב-Chrome וקבל כפתור מדידה בכל מוצר שגולשים עליו — H&M, ASOS, אמזון, IKEA ועוד 500+ חנויות!\n\nלהורדה → https://tryit4u.ai/#download",
  "4": "👗 *מדידת אופנה:*\nהעלה סלפי → גלוש בחנות בגדים → לחץ על הכפתור → ראה את הבגד על התמונה שלך תוך שניות! עובד על חולצות, שמלות, מכנסיים, נעליים, משקפיים ועוד 😍\n\nהתחל חינם → https://tryit4u.ai",
  "5": "🛋️ *תצוגת ריהוט:*\nהעלה תמונה של החדר שלך → גלוש ב-IKEA, Wayfair, אמזון → הAI ממקם את הריהוט בחדר שלך עם פרופורציות מדויקות!\n\nנסה חינם → https://tryit4u.ai",
};

// ── Detect Hebrew ─────────────────────────────────────────────────────────────
function isHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

// ── POST /whatsapp/webhook ─────────────────────────────────────────────────────
router.post("/webhook", async (req: Request, res: Response) => {
  const twilioModule = await import("twilio");
  const twiml = new twilioModule.default.twiml.MessagingResponse();

  try {
    const incomingMsg = (req.body.Body as string || "").trim();
    const from = req.body.From as string;
    const hebrew = isHebrew(incomingMsg);

    console.log(`[WhatsApp] ${from}: ${incomingMsg}`);

    // ── First-time user: show welcome menu ───────────────────────────────────
    if (!seenUsers.has(from)) {
      seenUsers.add(from);
      twiml.message(hebrew ? WELCOME_HE : WELCOME_EN);
      res.type("text/xml").send(twiml.toString());
      return;
    }

    // ── Quick reply: user picked a number ────────────────────────────────────
    const trimmed = incomingMsg.replace(/[.,!?]/g, "").trim();
    const quickMap = hebrew ? QUICK_REPLIES_HE : QUICK_REPLIES;
    if (quickMap[trimmed]) {
      twiml.message(quickMap[trimmed]);
      res.type("text/xml").send(twiml.toString());
      return;
    }

    // ── AI response with conversation memory ─────────────────────────────────
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!incomingMsg || !openaiKey) {
      twiml.message(hebrew ? "שלום! 👋 איך אוכל לעזור לך עם TryIt4U?" : "Hi! 👋 How can I help you with TryIt4U today?");
      res.type("text/xml").send(twiml.toString());
      return;
    }

    // Get/update conversation history
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
      (hebrew ? "תודה! בקר ב-tryit4u.ai לפרטים נוספים 🌟" : "Thanks! Visit tryit4u.ai to learn more 🌟");

    // Save assistant reply to history
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
