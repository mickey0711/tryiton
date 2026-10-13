import { Pool } from "pg";
import { logger } from "../config/logger";

/**
 * DigitalOcean managed Postgres uses a CA that is not in Node's trust store, and the
 * connection string carries `sslmode=require`, which pg (>=8.x) treats as verify-full.
 * We strip the sslmode/ssl params from the URL so the explicit `ssl` option below wins:
 * encrypted connection, certificate not verified (DB-only — this no longer relies on the
 * global NODE_TLS_REJECT_UNAUTHORIZED=0, which disabled TLS verification for every
 * outbound request). Set DATABASE_CA_CERT to the DO CA certificate to enable verification.
 */
function connectionConfig() {
    const raw = process.env.DATABASE_URL ?? "";
    let connectionString = raw;
    let wantsSsl = process.env.NODE_ENV === "production";
    try {
        const u = new URL(raw);
        const mode = u.searchParams.get("sslmode");
        if (mode && mode !== "disable") wantsSsl = true;
        // Only the mode is overridden; client-cert / root-cert params stay on the URL for pg to use.
        for (const k of ["sslmode", "uselibpqcompat"]) u.searchParams.delete(k);
        connectionString = u.toString();
    } catch { /* not a URL (e.g. unset in tests) — pass through */ }

    const ca = process.env.DATABASE_CA_CERT;
    const ssl = !wantsSsl ? false
        : ca ? { ca, rejectUnauthorized: true }
        : { rejectUnauthorized: false };
    if (wantsSsl && !ca) {
        logger.warn("DATABASE_CA_CERT not set — Postgres TLS is encrypted but the server certificate is NOT verified. " +
            "Set DATABASE_CA_CERT (DigitalOcean: `doctl databases get-ca <db-id>`) to enable verification.");
    }
    return { connectionString, ssl };
}

export const db = new Pool({
    ...connectionConfig(),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});

db.on("error", (err) => logger.error({ err }, "DB pool error"));
