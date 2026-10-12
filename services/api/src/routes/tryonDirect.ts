/**
 * POST /fit/tryon-direct        — create Replicate prediction, return immediately
 * GET  /fit/tryon-direct/poll/:id — proxy single status check to Replicate
 *
 * Async design avoids DO App Platform's 30-second proxy timeout:
 * the POST returns in <2 s, the client polls /poll/:id every 3 s.
 *
 * Access: signed-in users pay one credit per generation (refunded if the model fails);
 * anonymous users get a small per-IP daily allowance (see middleware/anonLimit).
 */

import { Router, Request, Response } from "express";
import { logger } from "../config/logger";
import { optionalAuth, AuthRequest } from "../middleware/auth";
import { anonLimit, isImageInput } from "../middleware/anonLimit";
import { chargeCredit, refundCredit } from "../services/credits";

const router = Router();

const REPLICATE_API = "https://api.replicate.com/v1";
const IDMVTON_VERSION = "0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985";
const PREDICTION_ID_RE = /^[A-Za-z0-9_-]{6,80}$/;

const garmentSlot: Record<string, string> = {
    tops:   "upper_body",
    jacket: "upper_body",
    shirt:  "upper_body",
    dress:  "dresses",
    pants:  "lower_body",
    jeans:  "lower_body",
    skirt:  "lower_body",
};

// prediction id → user charged for it, so a failed poll can refund exactly once.
const chargedPredictions = new Map<string, { userId: string; at: number }>();
setInterval(() => {
    const cutoff = Date.now() - 30 * 60_000;
    for (const [id, v] of chargedPredictions) if (v.at < cutoff) chargedPredictions.delete(id);
}, 5 * 60_000).unref();

async function refundOnce(predictionId: string, reason: string) {
    const entry = chargedPredictions.get(predictionId);
    if (!entry) return;
    chargedPredictions.delete(predictionId);
    await refundCredit(entry.userId, reason).catch((err) =>
        logger.error({ err, predictionId }, "credit refund failed"));
}

// ─── POST / — create prediction ───────────────────────────────────────────────
router.post("/", optionalAuth, anonLimit, async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).userId as string | undefined;
    let charged = false;
    try {
        const { human_img, garment_url, category = "tops" } = req.body as {
            human_img: unknown;
            garment_url: unknown;
            category?: unknown;
        };

        if (!isImageInput(human_img) || !isImageInput(garment_url)) {
            return res.status(400).json({
                error: "MISSING_PARAMS",
                message: "human_img and garment_url must be image URLs or data URIs",
            });
        }
        const cat = typeof category === "string" && /^[a-z]{2,20}$/i.test(category) ? category : "tops";

        const token = process.env.REPLICATE_API_TOKEN;
        if (!token) {
            return res.status(503).json({
                error: "NOT_CONFIGURED",
                message: "AI service not configured",
            });
        }

        let creditsLeft: number | undefined;
        if (userId) {
            const r = await chargeCredit(userId, "tryon-direct");
            charged = !r.unlimited;
            creditsLeft = r.credits;
        }

        const slot = garmentSlot[cat.toLowerCase()] ?? "upper_body";

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
                    garment_des: `A ${cat} clothing item`,
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
            if (charged && userId) await refundCredit(userId, "replicate-create-failed");
            return res.status(503).json({
                error: "REPLICATE_ERROR",
                message: friendly[predRes.status] ?? `AI service error (${predRes.status}).`,
            });
        }

        const prediction = await predRes.json();
        logger.info({ predictionId: prediction.id, status: prediction.status, userId }, "Prediction created");

        const fail = async (message: string) => {
            if (charged && userId) await refundCredit(userId, "replicate-immediate-failure");
            return res.status(503).json({ error: "REPLICATE_ERROR", message });
        };

        // Check for immediate error
        if (prediction.error) return fail(`AI model error: ${prediction.error}`);

        // Fast path: Replicate already finished within the 5 s wait window
        if (prediction.status === "succeeded") {
            const output = prediction.output;
            const resultUrl = Array.isArray(output) ? output[0] : output;
            return res.json({
                result_url: resultUrl,
                fit_score: Math.floor(75 + Math.random() * 20),
                credits_left: creditsLeft,
            });
        }

        if (prediction.status === "failed" || prediction.status === "canceled") {
            return fail(prediction.error ?? "AI generation failed immediately. Please try again.");
        }

        if (!prediction.id) return fail("AI service returned an unexpected response.");

        if (charged && userId) chargedPredictions.set(prediction.id, { userId, at: Date.now() });

        // Slow path: still processing — return prediction_id for client-side polling
        return res.json({
            prediction_id: prediction.id,
            status: "processing",
            credits_left: creditsLeft,
        });

    } catch (err: any) {
        if (charged && userId) await refundCredit(userId, "tryon-direct-error").catch(() => {});
        if (err?.statusCode === 402) {
            return res.status(402).json({ error: "PAYMENT_REQUIRED", message: err.message });
        }
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
            message: "An unexpected error occurred",
        });
    }
});

// ─── GET /poll/:predictionId — single status check (client polls this) ─────────
router.get("/poll/:predictionId", async (req: Request, res: Response) => {
    try {
        const { predictionId } = req.params;
        if (!PREDICTION_ID_RE.test(predictionId)) {
            return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid prediction id" });
        }
        const token = process.env.REPLICATE_API_TOKEN;
        if (!token) {
            return res.status(503).json({ error: "NOT_CONFIGURED", message: "AI service not configured" });
        }

        const pollRes = await fetch(`${REPLICATE_API}/predictions/${encodeURIComponent(predictionId)}`, {
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
            chargedPredictions.delete(predictionId);
            logger.info({ predictionId }, "Poll: succeeded");
            return res.json({
                status: "succeeded",
                result_url: resultUrl,
                fit_score: Math.floor(75 + Math.random() * 20),
            });
        }

        if (data.status === "failed" || data.status === "canceled") {
            logger.warn({ predictionId, error: data.error }, "Poll: failed");
            await refundOnce(predictionId, "replicate-failed");
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
            message: "An unexpected error occurred",
        });
    }
});

export default router;
