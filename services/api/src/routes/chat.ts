import { Router } from "express";

const router = Router();

const STYLIST_SYSTEM = `You are a friendly AI fashion & home stylist for TryIt4U — virtual try-on app.
You help users decide if a product fits them well, recommend sizes, and suggest styling tips.

Rules:
- Be warm, concise (2-4 sentences), helpful
- If the user seems happy → encourage them and suggest what to pair it with
- If the user is unsure → give specific advice based on category and fit score
- Always reply in English
- Don't repeat information already stated — keep conversation flowing naturally`;

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

router.post("/fit-advisor", async (req, res) => {
    try {
        const { messages, category, fitScore } = req.body as {
            messages: ChatMessage[];
            category?: string;
            fitScore?: number;
        };

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "messages array required" });
        }

        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            // Fallback demo response
            return res.json({ message: "Looking great! The fit seems spot on for your body type. Want me to suggest what to pair it with? 👗✨" });
        }

        const contextNote = [
            category ? `Product category: ${category}` : null,
            fitScore != null ? `AI Fit Score: ${fitScore}%` : null,
        ].filter(Boolean).join(". ");

        const systemWithContext = STYLIST_SYSTEM + (contextNote ? `\n\nContext: ${contextNote}` : "");

        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey: openaiKey });

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemWithContext },
                ...messages.slice(-8), // last 8 messages for context
            ],
            max_tokens: 200,
            temperature: 0.75,
        });

        const message = completion.choices[0]?.message?.content ?? "Looks great on you! ✨";
        res.json({ message });
    } catch (err: any) {
        console.error("[Chat] Error:", err.message);
        res.json({ message: "You look amazing in this! If you need sizing tips, just ask 😊" });
    }
});

export default router;
