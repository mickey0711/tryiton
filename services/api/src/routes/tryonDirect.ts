/**
 * POST /fit/tryon-direct        — create Replicate prediction, return immediately
 * GET  /fit/tryon-direct/poll/:id — proxy single status check to Replicate
 *
 * Async design avoids DO App Platform's 30-second proxy timeout:
 * the POST returns in <2 s, the client polls /poll/:id every 3 s.
 */

import { Router, Request, Response } from "express";
import { logger } from "../config/logger";

const router = Router();

const REPLICATE_API = "https://api.replicate.com/v1";
const IDMVTON_VERSION = "0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985";

const garmentSlot: Record<string, string> = {
    tops:   "upper_body",
    jacket: "upper_body",
    shirt:  "upper_body",
    dress:  "dresses",
    pants:  "lower_body",
    jeans:  "lower_body",
    skirt:  "lower_body",
};

// ─── POST / — create prediction ───────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
    try {
        const { human_img, garment_url, category = "tops" } = req.body as {
            human_img: string;
            garment_url: string;
            category?: string;
        };

        if (!human_img || !garment_url) {
            return res.status(400).json({
                error: "MISSING_PARAMS",
                message: "human_img and garment_url are required",
            });
        }

        const token = process.env.REPLICATE_API_TOKEN;
        if (!token) {
            return res.status(503).json({
                error: "NOT_CONFIGURED",
                message: "AI service not configured",
            });
        }

        const slot = garmentSlot[category.toLowerCase()] ?? "upper_body";

        // Create prediction — 8 s hard timeout so DO's proxy never kills us
        const predRes = await fetch(`${REPLICATE_API}/predictions`, {
            method: "POST",
            signal: AbortSignal.timeout(8000),
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                version: IDMVTON_VERSION,
                input: {
                    human_img,
                    garm_img: garment_url,
                    garment_des: `A ${category} clothing item`,
                    category: slot,
                    is_checked: true,
                    is_checked_crop: true,
                    denoise_steps: 30,
                    seed: 42,
                },
            }),
        });

        if (!predRes.ok) {
            const friendly: Record<number, string> = {
                429: "AI is busy — please try again in a moment.",
                402: "AI quota exceeded.",
                401: "AI service misconfigured.",
            };
            logger.error({ status: predRes.status }, "Replicate create prediction failed");
            return res.status(503).json({
                error: "REPLICATE_ERROR",
                message: friendly[predRes.status] ?? `AI service error (${predRes.status}).`,
            });
        }

        const prediction = await predRes.json();
        logger.info({ predictionId: prediction.id, status: prediction.status }, "Prediction created");

        // Check for immediate error
        if (prediction.error) {
            return res.status(503).json({
                error: "REPLICATE_ERROR",
                message: `AI model error: ${prediction.error}`,
            });
        }

        // Fast path: Replicate already finished within the 5 s wait window
        if (prediction.status === "succeeded") {
            const output = prediction.output;
            const resultUrl = Array.isArray(output) ? output[0] : output;
            return res.json({
                result_url: resultUrl,
                fit_score: Math.floor(75 + Math.random() * 20),
            });
        }

        if (prediction.status === "failed" || prediction.status === "canceled") {
            return res.status(503).json({
                error: "REPLICATE_ERROR",
                message: prediction.error ?? "AI generation failed immediately. Please try again.",
            });
        }

        if (!prediction.id) {
            return res.status(503).json({
                error: "REPLICATE_ERROR",
                message: "AI service returned an unexpected response.",
            });
        }

        // Slow path: still processing — return prediction_id for client-side polling
        return res.json({
            prediction_id: prediction.id,
            status: "processing",
        });

    } catch (err: any) {
        if (err?.name === "TimeoutError" || err?.name === "AbortError") {
            logger.warn("tryon-direct POST: Replicate connection timed out");
            return res.status(503).json({
                error: "TIMEOUT",
                message: "AI service is taking too long. Please try again.",
            });
        }
        logger.error({ errMsg: err?.message }, "tryon-direct POST error");
        return res.status(500).json({
            error: "INTERNAL_ERROR",
            message: err?.message ?? "An unexpected error occurred",
        });
    }
});

// ─── GET /poll/:predictionId — single status check (client polls this) ─────────
router.get("/poll/:predictionId", async (req: Request, res: Response) => {
    try {
        const { predictionId } = req.params;
        const token = process.env.REPLICATE_API_TOKEN;
        if (!token) {
            return res.status(503).json({ error: "NOT_CONFIGURED", message: "AI service not configured" });
        }

        const pollRes = await fetch(`${REPLICATE_API}/predictions/${predictionId}`, {
            signal: AbortSignal.timeout(8000),
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!pollRes.ok) {
            return res.status(503).json({ error: "REPLICATE_ERROR", message: `Poll failed (${pollRes.status})` });
        }

        const data = await pollRes.json();

        if (data.status === "succeeded") {
            const output = data.output;
            const resultUrl = Array.isArray(output) ? output[0] : output;
            logger.info({ predictionId }, "Poll: succeeded");
            return res.json({
                status: "succeeded",
                result_url: resultUrl,
                fit_score: Math.floor(75 + Math.random() * 20),
            });
        }

        if (data.status === "failed" || data.status === "canceled") {
            logger.warn({ predictionId, error: data.error }, "Poll: failed");
            return res.json({
                status: "failed",
                message: data.error ?? "AI generation failed. Please try again.",
            });
        }

        // Still processing
        return res.json({ status: data.status ?? "processing" });

    } catch (err: any) {
        if (err?.name === "TimeoutError" || err?.name === "AbortError") {
            return res.status(503).json({ error: "TIMEOUT", message: "Poll timed out. Try again." });
        }
        logger.error({ errMsg: err?.message }, "tryon-direct poll error");
        return res.status(500).json({
            error: "INTERNAL_ERROR",
            message: err?.message ?? "An unexpected error occurred",
        });
    }
});

export default router;
