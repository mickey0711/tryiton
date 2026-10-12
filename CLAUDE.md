# TryItOn (TryIt4U) — AI Virtual Try-On Chrome Extension

## What is this
Chrome Extension + Backend system for universal AI virtual try-on.
Users can try on clothes, glasses, shoes, furniture and any product from any shopping site
by overlaying it on their own photo. Works on every product page on the web.

## Tech Stack
- **Extension:** Chrome Manifest V3, React + TypeScript, Vite
- **API:** Node.js + Express + TypeScript (port 8080)
- **DB:** PostgreSQL + pgvector (via Postgres.js)
- **Queue:** Redis + BullMQ
- **Storage:** AWS S3 (LocalStack for dev)
- **Inference:** Python 3.11, Replicate API, Segmind API
- **Web:** Next.js (share pages + gallery)
- **Payments:** Lemon Squeezy
- **Email:** Resend.io
- **Chat AI:** OpenAI GPT-4o-mini

## Architecture
```
Chrome Extension (MV3 React)
  ↓ presigned upload → S3
  ↓ POST /fit/jobs → API
API (Express/TS)
  → Redis (BullMQ queue: "bull:q:generate")
Python Worker ← Redis
  → downloads assets from S3
  → quality gate (face detection, brightness, sharpness)
  → AI provider (Mock | Replicate | Segmind)
  → uploads result to S3
  → updates job status in Postgres
Extension polls GET /fit/jobs/:id → shows result
```

## Monorepo Structure
```
tryit4u/
  apps/
    extension/          Chrome MV3 + React popup (16 screens)
    web/                Next.js share pages
  services/
    api/src/            Express API (Node/TS)
      routes/           ~20 route files
      db/               Postgres client + migrations
      middleware/        Auth, error handler
      services/          Queue, email, priceSearch
    inference/tryon/    Python GPU worker
      worker.py         BullMQ consumer + job orchestration
      providers.py      Mock | Replicate | Segmind AI providers
      quality_gate.py   Selfie validation (face, brightness, sharpness)
      space_runner.py   Room intelligence (space try-on)
  packages/shared/     Zod schemas + TypeScript types
  landing/             Marketing pages (HTML/CSS)
  infra/               LocalStack S3 init
```

## Key Extension Screens
| Screen | Purpose |
|--------|---------|
| OnboardingScreen | First-time selfie capture |
| ReadyScreen | Main hub after setup |
| LoadingScreen | Job progress (0-100%) |
| ResultScreen | Fit result + score + share/save |
| OutfitBuilderScreen | Multi-item outfit (UI placeholder) |
| SceneVibeScreen | Product in scene (TODO: backend) |
| PoseStudioScreen | Pose variation (placeholder) |
| AIChatScreen | AI stylist chat (OpenAI) |
| PriceIntelligenceScreen | Price compare (TODO: backend) |
| SizeAdvisorScreen | Size recommendation (Replicate LLAVA) |
| WishlistScreen | Saved favorites |
| SettingsScreen | Credits, referral, logout |
| SpaceUploadScreen | Room photo upload |
| SpaceResultScreen | Furniture in room result |
| AtmosphereScreen | Room restyle (modern/cozy/etc.) |
| MultiPhotoScreen | Batch selfie (placeholder) |

## AI Providers
- **Mock** (local, CPU): Composite overlay, no external deps — for dev/testing
- **Replicate (Garments):** `cuuupid/idm-vton` — tops/jacket/dress/pants
- **Replicate (Shoes):** `dcsaurabh/virtual-shoe-try-on`
- **Replicate (Face accessories):** `alaradirik/t2i-adapter-sdxl-face`
- **Replicate (BG removal):** `cjwbw/rembg` — for space try-on
- **Replicate (Vision):** `yorickvp/llava-13b` — space advisor fallback
- **Segmind:** `https://api.segmind.com/v1/virtual-try-on` — alternative provider
- **OpenAI GPT-4o Vision** — space advisor (primary), fit advisor chat
- **Accessories (watch/jewelry/bag/hair/makeup/nails):** MockProvider fallback (no model yet)

## Quality Gate (selfie validation)
- Min resolution: 400×400 px
- Brightness: 40–210 (no dark/blown-out)
- Sharpness: Laplacian variance ≥ 80 (no blur)
- Aspect ratio: not extreme landscape
- Face detection: OpenCV Haar cascade, face ≥ 4% of image area

## Job Lifecycle
`queued` → `running` → `succeeded` | `failed`
- Retry: 3 attempts, exponential backoff (2s, 4s, 8s)
- Timings tracked: download_selfie_ms, download_product_ms, generate_ms, upload_ms, total_ms
- Fit score: currently MOCK (Sprint 3 TODO: real scoring model)

## Auth System
- Password hashes: `pbkdf2$<iter>$<salt>$<hex>` with a random per-user salt (legacy single-salt hex hashes are upgraded on login)
- Google/Apple tokens are verified with the provider (tokeninfo / Apple JWKS) — never just decoded
- `POST /auth/reset-password {token,password}` completes forgot-password and revokes refresh tokens; `POST /auth/logout {refresh_token}` revokes one
- OAuth web redirect puts tokens in the URL fragment (`/auth/success#access_token=…`)
- `requireAuth` confirms the user row still exists (60s cache); `optionalAuth` + `anonLimit` give anonymous visitors `ANON_TRYON_DAILY_LIMIT` free AI runs per IP per day
- Credits: `services/credits.ts` (`chargeCredit` / `refundCredit`) — charged on /fit/jobs, /fit/tryon-direct, /space/*; refunded when the AI run fails. `-1` = unlimited
- Admin panel: `ADMIN_TOKEN` env (16+ chars) is mandatory; visit `/admin/overview?token=…` once → HttpOnly cookie. No default token.
- Email + password (registration/login)
- JWT (7 days) + refresh tokens (30 days) stored in chrome.storage.local
- PBKDF2 password hashing (100k iterations, SHA512)
- Brute-force: 5 failed attempts → 15-min lockout (in-memory, Redis recommended)
- Admin user: mickey@casabair.co.il (unlimited credits, plan='admin')

## Database Tables (key ones)
| Table | Purpose |
|-------|---------|
| users | Accounts, plan, credits |
| user_profiles | Body metrics, style_vector (pgvector) |
| assets | S3 keys, types (selfie/room/product/result) |
| products | Product metadata, embedding (pgvector) |
| jobs | Try-on jobs, status, fit_score, timings |
| favorites | User bookmarks |
| saved_items | Saved try-on results (snapshot JSONB) |
| share_pages | Public share links |
| events | Analytics |
| newsletter_subscribers | Marketing |
| referrals / referral_uses | Referral system |
| campaigns / site_pixels | Ad tracking |

## Environment Variables Required
```
# API (services/api/.env)
DATABASE_URL          # Postgres connection string
REDIS_URL             # Redis connection string
JWT_SECRET            # Auth token signing key
S3_BUCKET             # S3 bucket name
AWS_ACCESS_KEY_ID     # S3 access key
AWS_SECRET_ACCESS_KEY # S3 secret key
AWS_REGION            # S3 region
RESEND_API_KEY        # Email (optional, degrades gracefully)
OPENAI_API_KEY        # Chat + space advisor
LEMON_SQUEEZY_API_KEY # Payments
ADMIN_BOOTSTRAP_SECRET # Admin password setup
ADMIN_TOKEN           # Admin panel (required, 16+ chars)
GOOGLE_EXTRA_CLIENT_IDS # Extra Google client ids allowed (extension), comma-separated
APPLE_CLIENT_ID       # Sign in with Apple audience (optional)
ANON_TRYON_DAILY_LIMIT # Free anonymous AI runs per IP/day (default 2)

# Inference (services/inference/tryon/.env)
REDIS_URL             # Same Redis instance
DATABASE_URL          # Same Postgres
S3_BUCKET / AWS_*     # Same S3
REPLICATE_API_TOKEN   # Primary AI provider
SEGMIND_API_KEY       # Fallback AI provider
OPENAI_API_KEY        # Space advisor (GPT-4o Vision)
SENTRY_DSN            # Optional error tracking
REPLICATE_MODEL_TRYON         # Override garment model
REPLICATE_MODEL_SHOES         # Override shoes model
REPLICATE_MODEL_FACE_ACCESSORIES # Override face accessories model
```

## Running Locally
```bash
# Full stack (recommended)
docker-compose up --build

# Individual services
cd services/api && npm run dev          # API on :8080
cd services/inference/tryon && python worker.py
cd apps/extension && npm run dev        # Watch mode (rebuild dist/)
cd apps/web && npm run dev              # Next.js on :3000

# Load extension in Chrome
# chrome://extensions → Developer Mode → Load Unpacked → apps/extension/dist
```

## Known Bugs / Critical Issues
1. **Asset ownership not verified on job creation** — user_id not checked on input assets
2. **Share ID low entropy** — 16-char hex, guessable; upgrade to UUID
3. **Brute-force protection in-memory** — lost on restart; move to Redis
4. **Asset claim race condition** — ON CONFLICT in assets doesn't check ownership
5. **Fit score is always MOCK** — Sprint 3 TODO: real scoring model
6. **No rate limit on job creation** — can DoS worker queue
7. **No CSRF protection on web forms** — add SameSite cookie + CSRF tokens
8. **Email verification token doesn't expire** — add 24h TTL
9. **SHA256 hardcoded as "placeholder"** in extension custom uploads
10. **Share links are permanent** — no default TTL on share_pages

## Incomplete Features (TODOs)
- Scene Vibe: UI ready, no backend endpoint
- Pose Studio: UI ready, no backend
- Multi-Photo mode: empty placeholder
- Price Intelligence: hardcoded mock data
- Real fit scoring model (Sprint 3)
- Body metrics population (user_profiles.body_metrics)
- Recommendation engine (pgvector embeddings ready, no queries)
- Outfit builder: UI only, no save logic
- Magic code auth (designed but not built — uses password auth instead)
- Dark mode
- Batch processing endpoint

## Current Extension Versions
- v1.0.8 (latest zip in apps/extension/; shared API client in src/lib/api.ts handles base URL + token refresh)
- Built with `npm run build:extension` (Vite → dist/)

## Rules for AI Assistants
- Do NOT modify .env files or API keys
- Do NOT change the AI provider selection logic without explicit approval
- Do NOT delete the mock provider — it's needed for dev/testing without paid APIs
- Always verify asset ownership checks when modifying routes/jobs.ts or routes/assets.ts
- Preserve quality gate thresholds (they were tuned for production selfie quality)
- When adding new routes, add them to app.ts AND document in this file
- Test extension popup UI before pushing — run `npm run dev` in apps/extension
- Extension manifest version is MV3 — do not downgrade to MV2
- The user (Mickey) operates in IST timezone (UTC+2/+3)
