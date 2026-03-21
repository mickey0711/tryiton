import { Router } from "express";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { s3, S3_BUCKET } from "../config/s3";
import { db } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { PresignReq, ConfirmAssetReq } from "@tryiton/shared";

const router = Router();
router.use(requireAuth);

// POST /assets/presign — get a presigned S3 upload URL
router.post("/presign", async (req, res, next) => {
    try {
        const body = PresignReq.parse(req.body);
        const userId = (req as AuthRequest).userId;
        const s3Key = `raw/${userId}/${uuidv4()}.${body.mime.split("/")[1]}`;

        const command = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: s3Key,
            ContentType: body.mime,
            ContentLength: body.size,
            Metadata: { userId, type: body.type },
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
        res.json({ upload_url: uploadUrl, s3_key: s3Key, expires_in: 300 });
    } catch (err) {
        next(err);
    }
});

// POST /assets/confirm — confirm after client-side upload to S3
router.post("/confirm", async (req, res, next) => {
    try {
        const body = ConfirmAssetReq.parse(req.body);
        const userId = (req as AuthRequest).userId;

        const result = await db.query<{ id: string }>(
            `INSERT INTO assets(user_id, s3_key, type, sha256, width, height, mime)
       VALUES($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(s3_key) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
            [userId, body.s3_key, body.type, body.sha256, body.width, body.height, body.mime]
        );

        res.status(201).json({ id: result.rows[0].id, s3_key: body.s3_key, type: body.type });
    } catch (err) {
        next(err);
    }
});

// DELETE /assets/:id
router.delete("/:id", async (req, res, next) => {
    try {
        const userId = (req as AuthRequest).userId;
        const { rows } = await db.query<{ s3_key: string }>(
            `DELETE FROM assets WHERE id = $1 AND user_id = $2 RETURNING s3_key`,
            [req.params.id, userId]
        );
        if (!rows.length) throw new AppError("NOT_FOUND", "Asset not found", 404);
        // S3 deletion is async/background; for MVP just remove DB record
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// Helper: generate a short-lived signed GET URL for a result
export async function getResultSignedUrl(s3Key: string): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key });
    return getSignedUrl(s3, cmd, { expiresIn: 3600 });
}

export default router;
