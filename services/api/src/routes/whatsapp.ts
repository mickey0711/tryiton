import { Router, Request, Response } from "express";
import twilio from "twilio";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// System prompt for the AI bot
const SYSTEM_PROMPT = `You are a friendly AI assistant for TryIt4U — the world's first AI virtual try-on app.
You help customers understand how TryIt4U works and guide them to sign up.

Key facts about TryIt4U:
- Users upload a selfie and virtually try on ANY clothing, shoes, glasses, or accessories from ANY store (ZARA, Nike, Amazon, ASOS, H&M, and 500+ more)
- Works as a web app at tryit4u.ai and as a Chrome browser extension
- AI generates a photorealistic image of the product ON the user's own photo — instantly
- Pricing: Free (5 try-ons/month), Pro ($12.99/mo, 50 try-ons), Pro Plus ($29.99/mo, unlimited)
- Currently in early access — users can join the waitlist at tryit4u.ai

Instructions:
- Be warm, friendly, and helpful
- Answer in the same language the customer writes in (Hebrew or English)
- Keep answers concise (2-4 sentences max)
- Always end with a call to action like visiting tryit4u.ai or asking if they have more questions
- If asked about pricing, explain the tiers clearly
- If asked how it works, explain simply: upload photo → pick product → AI shows it on you`;

// POST /whatsapp/webhook — receives messages from Twilio
router.post("/webhook", async (req: Request, res: Response) => {
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const incomingMsg = req.body.Body as string;
    const from = req.body.From as string;

    console.log(`[WhatsApp] Message from ${from}: ${incomingMsg}`);

    if (!incomingMsg) {
      twiml.message("Hi! 👋 How can I help you with TryIt4U today?");
      res.type("text/xml").send(twiml.toString());
      return;
    }

    // Get AI response
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: incomingMsg },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const aiResponse =
      completion.choices[0]?.message?.content ||
      "Thanks for reaching out! Visit tryit4u.ai to learn more 🌟";

    twiml.message(aiResponse);
  } catch (err) {
    console.error("[WhatsApp] Bot error:", err);
    twiml.message(
      "Hey! 👋 Thanks for your message. Visit tryit4u.ai to try on any outfit on your photo instantly! ✨"
    );
  }

  res.type("text/xml").send(twiml.toString());
});

// GET /whatsapp/webhook — Twilio verification
router.get("/webhook", (req: Request, res: Response) => {
  res.status(200).send("WhatsApp webhook active ✅");
});

export default router;
