import { Router } from "express";
import crypto from "crypto";
import { db } from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { ProductIngestReq } from "@tryiton/shared";

const router = Router();

// Public + authed both fine here; we just upsert products
router.post("/ingest", async (req, res, next) => {
    try {
        const body = ProductIngestReq.parse(req.body);

        // Create a stable fingerprint from canonical_url + title + brand
        const raw = [body.url, body.title ?? "", body.brand ?? ""].join("::");
        const fingerprint = crypto
            .createHash("sha256")
            .update(raw)
            .digest("hex")
            .slice(0, 32);

        const { rows } = await db.query<{ id: string; created_at: Date }>(
            `INSERT INTO products(fingerprint, canonical_url, title, brand, price, category, description, metadata)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(fingerprint) DO UPDATE SET
         title = COALESCE(EXCLUDED.title, products.title),
         brand = COALESCE(EXCLUDED.brand, products.brand),
         price = COALESCE(EXCLUDED.price, products.price),
         category = COALESCE(EXCLUDED.category, products.category),
         updated_at = NOW()
       RETURNING id, created_at`,
            [
                fingerprint,
                body.url,
                body.title,
                body.brand,
                body.price,
                body.category ?? "other",
                body.description,
                JSON.stringify({ images: body.images ?? [] }),
            ]
        );

        const is_new = rows[0].created_at > new Date(Date.now() - 1000);
        res.status(201).json({
            product_id: rows[0].id,
            fingerprint,
            category: body.category ?? "other",
            is_new,
        });
    } catch (err) {
        next(err);
    }
});

export default router;
