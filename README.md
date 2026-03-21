# TryItOn — AI Universal Fit Intelligence Platform

> **"Will this fit me?"** — One button, any product, any page.

---

## Sprint 1 — Local Development Setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker + Docker Compose
- Chrome browser

---

## Quick Start

### 1. Clone & Install

```bash
cd /Users/mickeycohen/Desktop/TryItOn

# Copy environment
cp .env.example .env

# Install all packages
npm install
```

### 2. Start All Services (Docker)

```bash
docker-compose up --build
```

This starts:
- **Postgres** (port 5432) + pgvector
- **Redis** (port 6379)
- **LocalStack S3** (port 4566) — S3 bucket auto-created
- **API** (port 8080)
- **GPU Worker** (Python mock pipeline)
- **Web App** (port 3000)

### 3. Run DB Migrations

```bash
# On first run, migrations auto-run in the API container.
# Or manually:
cd services/api
npm run db:migrate
```

### 4. Load Extension in Chrome

```bash
# Build the extension
npm run build:extension

# Then in Chrome:
# 1. Go to chrome://extensions
# 2. Enable Developer Mode
# 3. Click "Load unpacked"
# 4. Select: /Users/mickeycohen/Desktop/TryItOn/apps/extension/dist
```

### 5. Test End-to-End

1. Navigate to any product page (e.g. zara.com, amazon.com/clothing)
2. Click the **"Will this fit me? ✨"** button (bottom-right)
3. First time: take a selfie or upload your photo
4. Extension auto-detects the product image
5. Click **"✨ Will This Fit Me?"**
6. Wait ~3–5 seconds for generation
7. See your result with Before/After toggle, Save ⭐, Share 🔗, Download ⬇

---

## Development (without Docker)

```bash
# Terminal 1: Start API
cd services/api
npm install
npm run dev

# Terminal 2: Start worker
cd services/inference/tryon
pip install -r requirements.txt
python worker.py

# Terminal 3: Watch extension
cd apps/extension
npm install
npm run dev
```

---

## Smoke Tests

```bash
# API health
curl http://localhost:8080/health
# → {"ok":true,"service":"tryiton-api"}

# Auth start (look for code in API console logs)
curl -X POST http://localhost:8080/auth/start \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
# → {"ok":true,"message":"Code sent"}
# Check API logs for the 6-digit code

# Auth verify (use code from logs)
curl -X POST http://localhost:8080/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"123456"}'
# → {"access_token":"...","refresh_token":"..."}
```

---

## Project Structure

```
TryItOn/
  apps/
    extension/          Chrome MV3 + React popup
    web/                Next.js share pages + gallery
  services/
    api/                Node/TS API (auth, jobs, assets, share)
    inference/
      tryon/            Python GPU worker (mock → real AI)
  packages/
    shared/             Zod schemas + TypeScript types
  infra/
    localstack-init.sh  Auto-creates S3 bucket
  docker-compose.yml
```

---

## Architecture Overview

```
Chrome Extension
  ↓ presigned upload → S3
  ↓ create job → API
API → Redis (BullMQ queue)
Python Worker ← Redis
  → downloads assets from S3
  → runs pipeline (mock/diffusion)
  → uploads result to S3
  → updates job status in Postgres
Extension polls API → shows result
```

---

## Swapping in Real AI (Sprint 2)

In `services/inference/tryon/worker.py`, replace `mock_composite()` with:

```python
async def real_generate(user_img, product_img, category):
    # Use Replicate, Segmind, or your own diffusion server
    import replicate
    output = replicate.run("your-model-version", input={...})
    return output
```

The rest of the pipeline stays the same.

---

## Next Steps (Sprint 2)

- [ ] Human segmentation model (replace mock)
- [ ] Pose estimation
- [ ] Diffusion try-on baseline (clothing)
- [ ] Refine + upscale pass
- [ ] Selfie quality gate improvements
- [ ] Sentry error tracking

See `task.md` for full Sprint breakdown.
