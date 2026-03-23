import { Router, Request, Response } from "express";

const router = Router();

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

// GET /messenger/webhook — Facebook verification challenge
router.get("/webhook", (req: Request, res: Response) => {
  const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN || "tryit4u_verify_2024";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[Messenger] Webhook verified ✅");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

// POST /messenger/webhook — receive messages from Facebook Messenger
router.post("/webhook", async (req: Request, res: Response) => {
  const body = req.body;

  if (body.object !== "page") {
    res.status(404).send("Not a page event");
    return;
  }

  // Acknowledge immediately (Facebook requires <5s response)
  res.status(200).send("EVENT_RECEIVED");

  // Process each message entry asynchronously
  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      if (!event.message || event.message.is_echo) continue;

      const senderId = event.sender.id;
      const messageText = event.message.text as string;

      if (!messageText) continue;

      console.log(`[Messenger] Message from ${senderId}: ${messageText}`);

      try {
        const openaiKey = process.env.OPENAI_API_KEY;
        const pageToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN;

        if (!openaiKey || !pageToken) {
          await sendMessengerReply(pageToken || "", senderId,
            "Hi! 👋 Thanks for reaching out. Visit tryit4u.ai to try on any outfit instantly!");
          continue;
        }

        // Get AI response
        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey: openaiKey });

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: messageText },
          ],
          max_tokens: 300,
          temperature: 0.7,
        });

        const aiResponse = completion.choices[0]?.message?.content
          || "Thanks for reaching out! Visit tryit4u.ai to learn more 🌟";

        await sendMessengerReply(pageToken, senderId, aiResponse);
      } catch (err) {
        console.error("[Messenger] Bot error:", err);
        const pageToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN || "";
        await sendMessengerReply(pageToken, senderId,
          "Hey! 👋 Visit tryit4u.ai to try on any outfit on your photo instantly! ✨");
      }
    }
  }
});

async function sendMessengerReply(pageToken: string, recipientId: string, text: string) {
  if (!pageToken) return;
  await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });
}

export default router;
