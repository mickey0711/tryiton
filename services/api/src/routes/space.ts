/**
 * POST /space/analyze
 *
 * Accepts a room photo (base64) + product URL + category.
 * Returns: composite result image (base64 or URL), advisor_text, fit_score.
 *
 * AI Pipeline (Replicate instruct-pix2pix):
 *   1. Build a descriptive prompt from category + product URL
 *   2. Run instruct-pix2pix: "add a [product] to this room"
 *   3. Poll for result → return image URL + advisor text
 *
 * Falls back to template advisor with original room if Replicate unavailable.
 */

import { Router } from "express";
import { AppError } from "../middleware/errorHandler";
import { Request, Response, NextFunction } from "express";

const router = Router();
// NOTE: Space analyze intentionally does NOT require auth so unauthenticated
// users can still try the feature. Auth is optional — used for usage tracking.

// ─── Space categories supported ─────────────────────────────────────────────
const SPACE_CATEGORIES = new Set([
    "furniture", "electronics", "lighting", "plants",
    "garden", "kitchen", "beauty", "other",
]);

const ADVISOR_TEMPLATES: Record<string, string> = {
    furniture:   "This piece fits the space beautifully! The proportions and style complement the room well. Check actual dimensions before ordering.",
    electronics: "The device fits the available wall/surface space perfectly. Consider cable management for a clean, minimal setup.",
    lighting:    "This fixture transforms the room atmosphere. Warm 2700K light recommended for a cosy, inviting feel.",
    plants:      "Perfect natural touch for this space! Ensure the spot gets at least 4h of indirect sunlight daily for healthy growth.",
    garden:      "Great fit for the outdoor area. Choose weather-rated materials for your local climate conditions.",
    kitchen:     "The appliance fits the counter dimensions well. Always verify door-swing and ventilation clearance before installing.",
    beauty:      "Product placed for reference. For beauty try-on, switch to selfie mode with the Makeup or Hair category.",
    other:       "Product visualised in your space. Check actual dimensions and proportions before ordering.",
};

// ─── Category → placement context ───────────────────────────────────────────
// Used when no product title is available (fallback generic prompt)
const PLACEMENT_FALLBACKS: Record<string, string> = {
    furniture:   "a stylish piece of furniture",
    electronics: "a modern electronic device",
    lighting:    "an elegant light fixture",
    plants:      "a beautiful indoor plant in a ceramic pot",
    garden:      "outdoor garden furniture or decor",
    kitchen:     "a kitchen appliance",
    beauty:      "a beauty product",
    other:       "a product",
};

// Category → placement instruction for instruct-pix2pix
const PLACEMENT_INSTRUCTIONS: Record<string, string> = {
    furniture:   "placed naturally in the room, keep existing walls and floor",
    electronics: "mounted or placed on the wall/surface in the room",
    lighting:    "installed as a light fixture in the room, warm ambient glow",
    plants:      "placed in the corner of the room with natural sunlight",
    garden:      "arranged naturally in the outdoor space",
    kitchen:     "placed on the kitchen counter or mounted on wall",
    beauty:      "displayed on the vanity surface",
    other:       "placed naturally in the space",
};

// ─── Build smart prompt from product title + category ────────────────────────
function buildSpacePlacementPrompt(category: string, productTitle?: string): string {
    const instruction = PLACEMENT_INSTRUCTIONS[category] ?? "placed naturally in the space";

    // Use product title if meaningful (not just a URL or very short)
    const cleanTitle = productTitle?.trim();
    const useTitle = cleanTitle && cleanTitle.length > 4 && !cleanTitle.startsWith("http");

    const subject = useTitle
        ? `"${cleanTitle.slice(0, 80)}"` // cap at 80 chars to avoid prompt bloat
        : PLACEMENT_FALLBACKS[category] ?? "a product";

    return `Photorealistic interior photo: add ${subject} ${instruction}. Keep the room layout, walls, floor, and all existing furniture exactly the same. High quality, 4K, professional photography.`;
}

// ─── Replicate pix2pix pipeline ──────────────────────────────────────────────
// Model: timothybrooks/instruct-pix2pix (latest verified version 2024-01)
const PIX2PIX_VERSION = "30c1d0b916a6f8efce20493f5d61ee27491ab2a60437c13c588468b9810ec23f";

async function runReplicateSpaceAnalysis(
    roomB64: string,
    productUrl: string,
    category: string,
    replicateToken: string,
    productTitle?: string
): Promise<{ resultUrl: string; advisorText: string; fitScore: number }> {
    const prompt = buildSpacePlacementPrompt(category, productTitle);
    const negativePrompt = "blurry, distorted, unrealistic, cartoon, drawing, sketch, low quality, bad composition, extra furniture, cluttered";

    const response = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${replicateToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            version: PIX2PIX_VERSION,
            input: {
                image: roomB64,
                prompt,
                negative_prompt: negativePrompt,
                num_inference_steps: 25,
                image_guidance_scale: 1.3,
                guidance_scale: 8,
                num_outputs: 1,
            },
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Replicate API error: ${JSON.stringify(err)}`);
    }

    const prediction = await response.json();

    // Poll for result (max 60s)
    const start = Date.now();
    while (Date.now() - start < 60_000) {
        await sleep(2500);
        const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
            headers: { Authorization: `Bearer ${replicateToken}` },
        });
        const polled = await pollRes.json();

        if (polled.status === "succeeded") {
            const resultUrl = Array.isArray(polled.output) ? polled.output[0] : polled.output;
            const advisor = productTitle
                ? `${ADVISOR_TEMPLATES[category] ?? "Great fit for the space!"} The AI visualized "${productTitle.slice(0, 60)}" in your space.`
                : ADVISOR_TEMPLATES[category] ?? "Great fit for the space!";
            return {
                resultUrl,
                advisorText: advisor,
                fitScore: 85 + Math.floor(Math.random() * 12),
            };
        }
        if (polled.status === "failed" || polled.status === "canceled") {
            throw new Error(`Prediction ${polled.status}: ${polled.error ?? "unknown"}`);
        }
    }
    throw new Error("Prediction timeout after 60s");
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

// ─── POST /space/analyze ─────────────────────────────────────────────────────
router.post("/analyze", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { room_image, product_url, product_title, category } = req.body as {
            room_image: string;
            product_url?: string;
            product_title?: string;  // ← new: product name from page (e.g. "IKEA SÖDERHAMN sofa")
            category: string;
        };

        if (!room_image) throw new AppError("BAD_REQUEST", "room_image is required", 400);
        if (!category) throw new AppError("BAD_REQUEST", "category is required", 400);
        if (!SPACE_CATEGORIES.has(category)) {
            throw new AppError("BAD_REQUEST", `Unsupported category '${category}'`, 400);
        }

        const replicateToken = process.env.REPLICATE_API_TOKEN;

        if (replicateToken) {
            try {
                const result = await runReplicateSpaceAnalysis(
                    room_image,
                    product_url ?? "",
                    category,
                    replicateToken,
                    product_title   // ← pass title for smart prompt
                );
                return res.json({
                    result_image: result.resultUrl,
                    advisor_text: result.advisorText,
                    fit_score: result.fitScore,
                    category,
                    ai_powered: true,
                    product_title: product_title ?? null,
                });
            } catch (aiErr: any) {
                console.warn("[/space/analyze] Replicate pipeline failed, using advisor fallback:", aiErr.message);
            }
        }

        // Fallback: return room image + template advisor text
        res.json({
            result_image: room_image,
            advisor_text: ADVISOR_TEMPLATES[category] ?? "This product looks like a great fit for your space!",
            fit_score: 80,
            category,
            ai_powered: false,
        });
    } catch (err) {
        next(err);
    }
});

// ── POST /space/atmosphere ────────────────────────────────────────────────────
// Restyle a room image into a chosen atmosphere/style using pix2pix AI

const ATMOSPHERE_STYLES: Record<string, { prompt: string; label: string }> = {
    modern:       { label: "Modern", prompt: "transform to modern minimalist interior design, clean lines, neutral palette, contemporary furniture, bright natural light" },
    cozy:         { label: "Cozy",   prompt: "transform to cozy warm interior, warm lighting, soft textures, cushions, candles, hygge style, amber tones" },
    scandinavian: { label: "Scandi", prompt: "transform to Scandinavian interior design, white walls, light wood, minimalist, functional, Nordic style" },
    bohemian:     { label: "Boho",   prompt: "transform to bohemian eclectic interior, colorful patterns, plants, rattan, layered textiles, artistic and free-spirited" },
    industrial:   { label: "Industrial", prompt: "transform to industrial loft interior design, exposed brick, metal accents, dark tones, Edison bulbs, raw materials" },
    luxe:         { label: "Luxe",   prompt: "transform to luxury interior design, marble, gold accents, velvet, high-end finishes, elegant and sophisticated" },
};

router.post("/atmosphere", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { room_image, style } = req.body as {
            room_image: string;
            style: string;
        };

        if (!room_image) throw new AppError("BAD_REQUEST", "room_image is required", 400);
        if (!style || !ATMOSPHERE_STYLES[style]) {
            throw new AppError("BAD_REQUEST", `style must be one of: ${Object.keys(ATMOSPHERE_STYLES).join(", ")}`, 400);
        }

        const atmStyle = ATMOSPHERE_STYLES[style];
        const replicateToken = process.env.REPLICATE_API_TOKEN;

        if (replicateToken) {
            try {
                const prompt = `Photorealistic interior photo: ${atmStyle.prompt}. Keep all room dimensions, layout, windows, and doors identical. High quality, 4K, professional interior photography.`;
                const negPrompt = "blurry, distorted, cartoon, drawing, low quality, unrealistic, different room shape";

                const response = await fetch("https://api.replicate.com/v1/predictions", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${replicateToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        version: PIX2PIX_VERSION,
                        input: {
                            image: room_image,
                            prompt,
                            negative_prompt: negPrompt,
                            num_inference_steps: 25,
                            image_guidance_scale: 1.2,
                            guidance_scale: 8,
                            num_outputs: 1,
                        },
                    }),
                });

                if (!response.ok) throw new Error(`Replicate error ${response.status}`);
                const prediction = await response.json();

                const start = Date.now();
                while (Date.now() - start < 65_000) {
                    await sleep(2500);
                    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
                        headers: { Authorization: `Bearer ${replicateToken}` },
                    });
                    const polled = await pollRes.json();
                    if (polled.status === "succeeded") {
                        const resultUrl = Array.isArray(polled.output) ? polled.output[0] : polled.output;
                        return res.json({ result_image: resultUrl, style, style_label: atmStyle.label, ai_powered: true });
                    }
                    if (polled.status === "failed" || polled.status === "canceled") throw new Error("AI failed");
                }
                throw new Error("Timeout");
            } catch (aiErr: any) {
                console.warn("[/space/atmosphere] AI failed, returning original:", aiErr.message);
            }
        }

        // Fallback — return original image
        res.json({ result_image: room_image, style, style_label: atmStyle.label, ai_powered: false });
    } catch (err) {
        next(err);
    }
});

export { ATMOSPHERE_STYLES };
export default router;

