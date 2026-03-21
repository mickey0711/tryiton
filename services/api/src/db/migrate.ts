import "dotenv/config";
import { db } from "./client";
import { logger } from "../config/logger";

const MIGRATIONS = [
    // 001: pgvector + users
    `
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    skin_tone TEXT,
    face_shape TEXT,
    body_metrics JSONB DEFAULT '{}',
    style_vector vector(768),
    usage_vector vector(768),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS auth_codes (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,

    // 002: assets + products
    `
  CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    s3_key TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    width INT,
    height INT,
    mime TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS assets_user_idx ON assets(user_id);

  CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fingerprint TEXT NOT NULL UNIQUE,
    canonical_url TEXT,
    title TEXT,
    brand TEXT,
    price NUMERIC,
    category TEXT,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    embedding vector(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS products_fingerprint_idx ON products(fingerprint);
  `,

    // 003: jobs
    `
  CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    intent TEXT NOT NULL,
    category TEXT NOT NULL,
    quality_profile TEXT NOT NULL DEFAULT 'balanced',
    input_assets JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    progress INT NOT NULL DEFAULT 0,
    fit_score INT,
    confidence NUMERIC,
    explanation JSONB DEFAULT '[]',
    result_asset_id UUID REFERENCES assets(id),
    model_versions JSONB DEFAULT '{}',
    timings_ms JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS jobs_user_idx ON jobs(user_id);
  CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
  `,

    // 004: library + events + share
    `
  CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, product_id)
  );
  CREATE INDEX IF NOT EXISTS fav_user_idx ON favorites(user_id);

  CREATE TABLE IF NOT EXISTS saved_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    snapshot JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS saved_user_idx ON saved_items(user_id);

  CREATE TABLE IF NOT EXISTS share_pages (
    id TEXT PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS events_user_idx ON events(user_id);
  CREATE INDEX IF NOT EXISTS events_type_idx ON events(event_type);
  `,

    // 005: newsletter + referrals
    `
  ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INT NOT NULL DEFAULT 5;

  CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    source TEXT NOT NULL DEFAULT 'landing',
    confirmed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS nl_email_idx ON newsletter_subscribers(email);

  CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    uses INT NOT NULL DEFAULT 0,
    credits_earned INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS referrals_user_idx ON referrals(referrer_id);
  CREATE UNIQUE INDEX IF NOT EXISTS referrals_code_idx ON referrals(code);

  CREATE TABLE IF NOT EXISTS referral_uses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(referee_id)
  );
  `,
    // 006: full user auth — name, phone, password, admin, email verification
    `
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS full_name        TEXT,
    ADD COLUMN IF NOT EXISTS phone           TEXT,
    ADD COLUMN IF NOT EXISTS password_hash   TEXT,
    ADD COLUMN IF NOT EXISTS is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verify_token TEXT;

  -- Unlimited credits for admin (-1 = no limit)
  INSERT INTO users (email, full_name, is_admin, email_verified, plan, credits)
    VALUES ('mickey@casabair.co.il', 'Mickey Cohen', TRUE, TRUE, 'admin', -1)
    ON CONFLICT (email) DO UPDATE
      SET is_admin = TRUE,
          email_verified = TRUE,
          plan = 'admin',
          credits = -1,
          full_name = COALESCE(users.full_name, 'Mickey Cohen'),
          updated_at = NOW();
    `,
    // 007: OAuth providers table (Google, Facebook, Apple)
    `
  CREATE TABLE IF NOT EXISTS oauth_providers (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider    TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_id)
  );
  CREATE INDEX IF NOT EXISTS oauth_providers_user_idx ON oauth_providers(user_id);
    `,
];

export async function runMigrations() {
    logger.info("Running DB migrations...");

    // Ensure migrations table exists
    await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      idx INT NOT NULL UNIQUE,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

    const { rows } = await db.query<{ idx: number }>(
        "SELECT idx FROM _migrations ORDER BY idx"
    );
    const done = new Set(rows.map((r) => r.idx));

    for (let i = 0; i < MIGRATIONS.length; i++) {
        if (done.has(i)) continue;
        logger.info({ migration: i }, `Applying migration ${i + 1}`);
        await db.query(MIGRATIONS[i]);
        await db.query("INSERT INTO _migrations(idx) VALUES($1)", [i]);
        logger.info({ migration: i }, `Migration ${i + 1} done`);
    }

    logger.info("✅ Migrations complete");
}

// Run directly: npx tsx src/db/migrate.ts
if (require.main === module) {
    runMigrations()
        .then(() => process.exit(0))
        .catch((err) => {
            logger.error({ err }, "Migration failed");
            process.exit(1);
        });
}
