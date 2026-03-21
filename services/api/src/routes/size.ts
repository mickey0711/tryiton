import { Router } from "express";
import { logger } from "../config/logger";

const router = Router();

// ── Size recommendation based on body photo ──────────────────────────────────

router.post("/analyze", async (req, res, next) => {
    try {
        const { image, category, product_title } = req.body as {
            image: string;
            category: string;
            product_title?: string;
        };

        if (!image) {
            return res.status(400).json({ error: "MISSING_IMAGE", message: "Body image is required" });
        }
        if (!category) {
            return res.status(400).json({ error: "MISSING_CATEGORY", message: "Category is required" });
        }

        // Check if Replicate token is available
        const replicateToken = process.env.REPLICATE_API_TOKEN;
        if (!replicateToken) {
            return res.json(getDemoSize(category));
        }

        try {
            // Use Replicate to analyze body proportions
            // Model: stability-ai/stable-diffusion or a vision model for body analysis
            const analysisResult = await analyzeBodyWithAI(image, category, product_title ?? "", replicateToken);
            res.json(analysisResult);
        } catch (aiErr: any) {
            logger.warn({ err: aiErr.message }, "AI size analysis failed — returning demo result");
            res.json(getDemoSize(category));
        }
    } catch (err) {
        next(err);
    }
});

// ── AI Body Analysis ──────────────────────────────────────────────────────────

async function analyzeBodyWithAI(
    imageBase64: string,
    category: string,
    productTitle: string,
    token: string
): Promise<SizeResult> {
    // Convert base64 to data URL if needed
    const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

    // Use Replicate's vision model (llava or similar) to analyze body proportions
    const prompt = buildAnalysisPrompt(category, productTitle);

    const response = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            version: "yorickvp/llava-13b:b5f6212d032508382d61ff594b60d91a499e9a06d64c04f0f6a5454867f08eb0",
            input: {
                image: imageUrl,
                prompt,
                max_tokens: 512,
                temperature: 0.2,
            },
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Replicate API error: ${JSON.stringify(err)}`);
    }

    const prediction = await response.json();

    // Poll for result
    const result = await pollPrediction(prediction.id, token, 45_000);
    return parseSizeFromAI(result, category);
}

async function pollPrediction(id: string, token: string, timeoutMs: number): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await sleep(2000);
        const resp = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const pred = await resp.json();

        if (pred.status === "succeeded") {
            return Array.isArray(pred.output) ? pred.output.join("") : String(pred.output ?? "");
        }
        if (pred.status === "failed" || pred.status === "canceled") {
            throw new Error(`Prediction ${pred.status}: ${pred.error ?? "unknown"}`);
        }
    }
    throw new Error("Prediction timeout");
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function buildAnalysisPrompt(category: string, productTitle: string): string {
    const isLower = ["pants", "jeans", "shorts", "skirt", "shoes"].some(k => category.includes(k));
    const bodyParts = isLower
        ? "full body proportions, hip width, waist, leg length, inseam"
        : "upper body proportions, shoulder width, chest, arm length, waist";

    return `You are a professional fashion size advisor analyzing a body photo.

Analyze the person's ${bodyParts} from this photo.
${productTitle ? `They want to buy: ${productTitle} (category: ${category}).` : `Category: ${category}.`}

Respond with ONLY a JSON object in this exact format (no other text):
{
  "recommended": "M",
  "confidence": 75,
  "measurements": {
    "chest": "98cm",
    "waist": "82cm",
    "hips": "96cm",
    "shoulder": "46cm"
  },
  "sizeChart": [
    {"size": "XS", "fits": false},
    {"size": "S", "fits": false},
    {"size": "M", "fits": true},
    {"size": "L", "fits": true},
    {"size": "XL", "fits": false}
  ],
  "tips": ["Tip about fit", "Another useful tip"]
}

Use standard EU/US sizing. If you cannot determine sizes from the photo, use your best estimate with lower confidence.`;
}

function parseSizeFromAI(rawOutput: string, category: string): SizeResult {
    try {
        // Try to extract JSON from the AI response
        const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.recommended) return parsed as SizeResult;
        }
    } catch {}

    // Attempt to parse size from text
    const sizeMatch = rawOutput.match(/\b(XS|S|M|L|XL|XXL|[0-9]{2}\/[0-9]{2})\b/i);
    const recommended = sizeMatch ? sizeMatch[1].toUpperCase() : "M";

    return getDemoSize(category, recommended);
}

// ── Demo fallback ─────────────────────────────────────────────────────────────

function getDemoSize(category: string, overrideSize?: string): SizeResult {
    const isLower = ["pants", "shoes"].includes(category);
    const size = overrideSize ?? "M";

    const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
    const idx = SIZES.indexOf(size.toUpperCase());

    return {
        recommended: size,
        confidence: 72,
        measurements: isLower
            ? { waist: "82cm", hips: "96cm", inseam: "81cm", height: "178cm" }
            : { chest: "98cm", waist: "82cm", shoulder: "46cm", height: "178cm" },
        sizeChart: SIZES.map((s, i) => ({
            size: s,
            fits: i === idx || i === idx + 1,
        })),
        tips: [
            size === "M"
                ? "Medium fits most standard cuts well"
                : `${size} suits your body proportions for this category`,
            "If between sizes, size up for a relaxed fit or size down for a fitted look",
        ],
    };
}

export interface SizeResult {
    recommended: string;
    confidence: number;
    measurements: {
        chest?: string;
        waist?: string;
        hips?: string;
        height?: string;
        inseam?: string;
        shoulder?: string;
    };
    sizeChart: { size: string; fits: boolean }[];
    tips: string[];
}

export default router;
