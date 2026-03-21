import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const AssetType = z.enum([
    "selfie",
    "room",
    "hand",
    "product",
    "result",
]);
export type AssetType = z.infer<typeof AssetType>;

export const Intent = z.enum(["visual", "spatial", "usage"]);
export type Intent = z.infer<typeof Intent>;

export const QualityProfile = z.enum(["fast", "balanced", "hq"]);
export type QualityProfile = z.infer<typeof QualityProfile>;

export const JobStatus = z.enum([
    "queued",
    "running",
    "succeeded",
    "failed",
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const ProductCategory = z.enum([
    "tops",
    "pants",
    "jacket",
    "dress",
    "shoes",
    "glasses",
    "watch",
    "jewelry",
    "hat",
    "hair",
    "makeup",
    "nails",
    "furniture",
    "electronics",
    "other",
]);
export type ProductCategory = z.infer<typeof ProductCategory>;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const AuthStartReq = z.object({
    email: z.string().email(),
});

export const AuthVerifyReq = z.object({
    email: z.string().email(),
    code: z.string().length(6),
});

export const AuthTokenRes = z.object({
    access_token: z.string(),
    refresh_token: z.string(),
    expires_in: z.number(),
});

// ─── Assets ───────────────────────────────────────────────────────────────────

export const PresignReq = z.object({
    type: AssetType,
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    size: z.number().int().positive().max(20_000_000), // 20MB max
});

export const PresignRes = z.object({
    upload_url: z.string().url(),
    s3_key: z.string().min(3),
    expires_in: z.number().default(300),
});

export const ConfirmAssetReq = z.object({
    s3_key: z.string().min(3),
    type: AssetType,
    sha256: z.string().min(32),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    mime: z.string().min(3),
});

export const AssetRes = z.object({
    id: z.string().uuid(),
    s3_key: z.string(),
    type: AssetType,
    width: z.number(),
    height: z.number(),
    created_at: z.string(),
});

// ─── Products ──────────────────────────────────────────────────────────────────

export const ProductIngestReq = z.object({
    url: z.string().url(),
    title: z.string().optional(),
    brand: z.string().optional(),
    price: z.number().optional(),
    category: ProductCategory.optional(),
    images: z.array(z.string().url()).optional(),
    description: z.string().optional(),
});

export const ProductIngestRes = z.object({
    product_id: z.string().uuid(),
    fingerprint: z.string(),
    category: ProductCategory,
    is_new: z.boolean(),
});

// ─── Jobs ──────────────────────────────────────────────────────────────────────

export const CreateJobReq = z.object({
    product_id: z.string().uuid(),
    user_asset_id: z.string().uuid(),
    room_asset_id: z.string().uuid().optional(),
    hand_asset_id: z.string().uuid().optional(),
    category: ProductCategory,
    intent: Intent,
    quality_profile: QualityProfile.default("balanced"),
});

export const JobStatusRes = z.object({
    job_id: z.string().uuid(),
    status: JobStatus,
    progress: z.number().int().min(0).max(100),
    fit_score: z.number().int().min(0).max(100).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    explanation: z.array(z.string()),
    result_signed_url: z.string().url().nullable(),
    result_thumbnail_url: z.string().url().nullable(),
    timings_ms: z.record(z.number()).nullable(),
    created_at: z.string(),
});

export type CreateJobReq = z.infer<typeof CreateJobReq>;
export type JobStatusRes = z.infer<typeof JobStatusRes>;

// ─── Library ───────────────────────────────────────────────────────────────────

export const AddFavoriteReq = z.object({
    product_id: z.string().uuid(),
});

export const SaveItemReq = z.object({
    job_id: z.string().uuid().optional(),
    product_id: z.string().uuid().optional(),
    snapshot: z.object({
        fit_score: z.number().nullable(),
        explanation: z.array(z.string()),
        result_url: z.string().url().optional(),
        product_title: z.string().optional(),
        product_image: z.string().url().optional(),
    }),
});

// ─── Share ─────────────────────────────────────────────────────────────────────

export const ShareRes = z.object({
    share_id: z.string(),
    share_url: z.string().url(),
    expires_at: z.string().nullable(),
});

export const SharePageData = z.object({
    share_id: z.string(),
    result_url: z.string().url(),
    product_title: z.string().optional(),
    fit_score: z.number().nullable(),
    created_at: z.string(),
});

// ─── Error ─────────────────────────────────────────────────────────────────────

export const ApiError = z.object({
    error: z.string(),
    message: z.string(),
    request_id: z.string().optional(),
});
