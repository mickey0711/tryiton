"""
TryItOn GPU Worker v2 — Sprint 2
Uses provider abstraction (mock / replicate / segmind).
Adds: quality gate, Sentry error tracking, structured logging.
"""
import asyncio
import os
import sys
import logging
import json
import io
import time

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("tryiton.worker")

# Sentry (optional — only initializes if DSN is set)
import sentry_sdk
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.2,
        environment=os.environ.get("ENV", "development"),
    )
    log.info("Sentry initialized")

import boto3
import httpx
import aioredis
import asyncpg
from botocore.client import Config
from PIL import Image

from providers import provider as get_provider
from quality_gate import check_selfie_quality, check_product_image

# ─── Config ───────────────────────────────────────────────────────────────────
REDIS_URL    = os.environ.get("REDIS_URL", "redis://redis:6379")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
S3_BUCKET    = os.environ.get("S3_BUCKET", "tryiton-local")
S3_ENDPOINT  = os.environ.get("S3_ENDPOINT", "")
AWS_REGION   = os.environ.get("AWS_REGION", "us-east-1")

s3 = boto3.client(
    "s3",
    endpoint_url=S3_ENDPOINT or None,
    aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID", "test"),
    aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY", "test"),
    region_name=AWS_REGION,
    config=Config(signature_version="s3v4"),
)


# ─── S3 helpers ───────────────────────────────────────────────────────────────

def s3_download(key: str) -> bytes:
    return s3.get_object(Bucket=S3_BUCKET, Key=key)["Body"].read()

def s3_upload(key: str, data: bytes, content_type: str = "image/jpeg"):
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType=content_type)

def load_image(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGB")

def normalize(img: Image.Image, max_size: int = 1024) -> Image.Image:
    w, h = img.size
    if max(w, h) > max_size:
        r = max_size / max(w, h)
        img = img.resize((int(w * r), int(h * r)), Image.LANCZOS)
    return img

def pil_to_bytes(img: Image.Image, quality: int = 90) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    return buf.getvalue()


# ─── Pipeline ─────────────────────────────────────────────────────────────────

async def process_job(pool: asyncpg.Pool, job_data: dict):
    job_id      = job_data["jobId"]
    user_id     = job_data["userId"]
    user_key    = job_data["userAssetKey"]
    product_url = job_data.get("productAssetKey", "")
    category    = job_data.get("category", "other")
    quality     = job_data.get("qualityProfile", "balanced")
    t0 = time.time()

    with sentry_sdk.push_scope() as scope if SENTRY_DSN else _noop_scope() as scope:
        scope.set_tag("category", category)
        scope.set_tag("quality_profile", quality)
        scope.set_user({"id": user_id})

    timings: dict = {}

    async def set_progress(p: int, status: str = "running"):
        await pool.execute(
            "UPDATE jobs SET status=$1, progress=$2, updated_at=NOW() WHERE id=$3",
            status, p, job_id,
        )

    await set_progress(8)

    # 1. Download user photo
    t = time.time()
    user_bytes = s3_download(user_key)
    timings["download_selfie_ms"] = int((time.time() - t) * 1000)

    # 2. Quality gate on selfie
    is_valid, reason, qmetrics = check_selfie_quality(user_bytes)
    if not is_valid:
        log.warning(f"[{job_id}] Quality gate rejected selfie: {reason}")
        await pool.execute(
            "UPDATE jobs SET status='failed', error_message=$1, updated_at=NOW() WHERE id=$2",
            f"QUALITY_GATE: {reason}", job_id,
        )
        return

    log.info(f"[{job_id}] Quality gate passed: {qmetrics}")
    user_img = normalize(load_image(user_bytes))
    await set_progress(20)

    # 3. Fetch product image
    t = time.time()
    if product_url.startswith("http"):
        async with httpx.AsyncClient(timeout=20) as http:
            r = await http.get(product_url)
            r.raise_for_status()
            product_bytes = r.content
    elif product_url:
        product_bytes = s3_download(product_url)
    else:
        product_bytes = pil_to_bytes(user_img)  # fallback

    timings["download_product_ms"] = int((time.time() - t) * 1000)

    ok, reason = check_product_image(product_bytes)
    if not ok:
        log.warning(f"[{job_id}] Product image check failed: {reason}")
    product_img = normalize(load_image(product_bytes), max_size=768)
    await set_progress(35)

    # 4. AI Generation
    ai = get_provider()
    log.info(f"[{job_id}] Running provider={ai.name} category={category} quality={quality}")
    t = time.time()
    result_img = await ai.generate(user_img, product_img, category, quality)
    timings["generate_ms"] = int((time.time() - t) * 1000)
    await set_progress(80)

    # 5. Encode + upload result
    t = time.time()
    result_bytes = pil_to_bytes(result_img, quality=90)
    result_key = f"results/{job_id}/result.jpg"
    s3_upload(result_key, result_bytes)
    timings["upload_ms"] = int((time.time() - t) * 1000)
    timings["total_ms"] = int((time.time() - t0) * 1000)
    await set_progress(92)

    # 6. Compute mock fit score (replace with real scoring model later)
    fit_score, confidence = compute_fit_score(category, qmetrics)

    # 7. Save result asset + update job
    asset_id = await pool.fetchval(
        """
        INSERT INTO assets(user_id, s3_key, type, sha256, mime)
        VALUES($1, $2, 'result', 'ai_generated', 'image/jpeg')
        ON CONFLICT(s3_key) DO UPDATE SET s3_key = EXCLUDED.s3_key
        RETURNING id
        """,
        user_id, result_key,
    )
    await pool.execute(
        """
        UPDATE jobs SET
          status='succeeded', progress=100,
          fit_score=$1, confidence=$2,
          explanation=$3::jsonb,
          result_asset_id=$4,
          timings_ms=$5::jsonb,
          model_versions=$6::jsonb,
          updated_at=NOW()
        WHERE id=$7
        """,
        fit_score,
        confidence,
        json.dumps(generate_explanation(category, fit_score)),
        asset_id,
        json.dumps(timings),
        json.dumps({"provider": ai.name}),
        job_id,
    )

    log.info(f"[{job_id}] ✅ Done fit_score={fit_score} timings={timings}")


def compute_fit_score(category: str, quality_metrics: dict) -> tuple[int, float]:
    """
    MVP scoring: deterministic mock.
    Sprint 3: replace with real scoring model (body proportion analysis).
    """
    # Base score varies by category confidence
    base = {"tops": 80, "pants": 78, "dress": 76, "glasses": 85, "shoes": 74}.get(category, 75)
    brightness_bonus = max(0, min(10, int((quality_metrics.get("brightness", 128) - 80) / 10)))
    sharpness_bonus = min(5, int(quality_metrics.get("sharpness", 200) / 200))
    score = min(99, base + brightness_bonus + sharpness_bonus)
    confidence = round(0.7 + (score - 70) / 200, 2)
    return score, confidence


def generate_explanation(category: str, score: int) -> list[str]:
    base = {
        "tops": ["Proportions match your torso", "Sleeve length looks right"],
        "pants": ["Length suitable for your height", "Waist fit looks good"],
        "dress": ["Length flatters your silhouette", "Style suits your proportions"],
        "glasses": ["Frame width matches your face width", "Bridge fits well"],
        "shoes": ["Scale appropriate for your height", "Style works with your outfit"],
        "furniture": ["Item fits your room's scale", "Proportions look balanced"],
        "electronics": ["Size appropriate for your use case"],
    }.get(category, ["Item looks good on you", "Style matches your aesthetic"])
    if score >= 85:
        base.append("Excellent fit — high confidence")
    elif score >= 75:
        base.append("Good fit — looks natural")
    else:
        base.append("Decent fit — consider alternate sizing")
    return base


# ─── Queue consumer (BullMQ via Redis) ────────────────────────────────────────

async def run_worker():
    redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=5)

    log.info(f"🚀 TryItOn worker v2 started | provider={os.environ.get('AI_PROVIDER','mock')} | queue=q:generate")

    while True:
        try:
            data = await redis.brpop("bull:q:generate:wait", timeout=5)
            if not data:
                continue

            _, job_id_raw = data
            job_hash = await redis.hgetall(f"bull:q:generate:{job_id_raw}")
            if not job_hash:
                continue

            job_data = json.loads(job_hash.get("data", "{}"))
            log.info(f"📥 Job picked up: {job_data.get('jobId')} category={job_data.get('category')}")

            try:
                await process_job(pool, job_data)
            except Exception as err:
                log.error(f"❌ Job {job_data.get('jobId')} failed: {err}", exc_info=True)
                if SENTRY_DSN:
                    sentry_sdk.capture_exception(err)
                try:
                    await pool.execute(
                        "UPDATE jobs SET status='failed', error_message=$1, updated_at=NOW() WHERE id=$2",
                        str(err)[:500], job_data.get("jobId"),
                    )
                except Exception:
                    pass

        except Exception as err:
            log.error(f"Worker loop error: {err}", exc_info=True)
            await asyncio.sleep(3)


# Context manager shim for when Sentry is disabled
from contextlib import contextmanager
@contextmanager
def _noop_scope():
    class _Scope:
        def set_tag(self, *a, **kw): pass
        def set_user(self, *a, **kw): pass
    yield _Scope()


if __name__ == "__main__":
    asyncio.run(run_worker())
