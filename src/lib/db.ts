import { Pool } from "pg";

// Direct Postgres connection for read-heavy aggregate queries (counts by
// state/city, grouped listings) that would be awkward or slow through
// PostgREST. Separate from src/lib/supabase/* (auth-aware clients used for
// user-facing/browser flows). Pooled and reused across hot reloads in dev.
declare global {
  var _pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global._pgPool) {
    global._pgPool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      max: 5,
    });
  }
  return global._pgPool;
}
