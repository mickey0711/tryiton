import { Router } from "express";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const STYLIST_SYSTEM = `You are a friendly AI fashion & home stylist for TryIt4U — virtual try-on app.
You help users decide if a product fits them well, recommend sizes, and suggest styling tips.

Rules:
- Be warm, concise (2-4 sentences), helpful
- If the user seems happy → encourage them and suggest what to pair it with
- If the user is unsure → give specific advice based on category and fit score
- Always reply in English
- Don't repeat information already stated — keep conversation flowing naturally`;

// Allowed roles only
const ALLOWED_ROLES = new Set(["user", "assistant"]);
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 500;

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

function sanitizeMessages(messages: unknown): ChatMessage[] {
    if (!Array.isArray(messages)) throw new Error("messages must be an array");
    if (messages.length > MAX_MESSAGES) throw new Error(`Too many messages (max ${MAX_MESSAGES})`);

    return messages.map((m, i) => {
        if (typeof m !== "object" || m === null) throw new Error(`Message ${i} must be an object`);
        const msg = m as Record<string, unknown>;

        if (!ALLOWED_ROLES.has(msg.role as string)) {
            throw new Error(`Message ${i} has invalid role`);
        }
        if (typeof msg.content !== "string") throw new Error(`Message ${i} content must be a string`);

        // Trim and enforce length
        const content = msg.content.trim().slice(0, MAX_MESSAGE_LENGTH);

        return { role: msg.role as "user" | "assistant", content };
    });
}

router.post("/fit-advisor", async (req, res) => {
    try {
        const { messages: rawMessages, category, fitScore } = req.body as {
            messages: unknown;
            category?: unknown;
            fitScore?: unknown;
        };

        // Validate and sanitize inputs
        const messages = sanitizeMessages(rawMessages);

        // Validate optional fields
        const safeCategory = typeof category === "string"
            ? category.slice(0, 50).replace(/[^a-zA-Z0-9_ -]/g, "")
            : undefined;
        const safeFitScore = typeof fitScore === "number" && fitScore >= 0 && fitScore <= 100
            ? fitScore
            : undefined;

        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            // Fallback demo response
            return res.json({ message: "Looking great! The fit seems spot on for your body type. Want me to suggest what to pair it with? 👗✨" });
        }

        const contextNote = [
            safeCategory ? `Product category: ${safeCategory}` : null,
            safeFitScore != null ? `AI Fit Score: ${safeFitScore}%` : null,
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
        if (err.message?.startsWith("Too many") || err.message?.startsWith("Message") || err.message?.startsWith("messages")) {
            return res.status(400).json({ error: "VALIDATION_ERROR", message: err.message });
        }
        console.error("[Chat] Error:", err.message);
        res.json({ message: "You look amazing in this! If you need sizing tips, just ask 😊" });
    }
});

export default router;
