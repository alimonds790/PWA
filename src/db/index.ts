import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy singleton so `next build` never opens a connection (D8/D9 in MEMORY.md).
// prepare:false keeps pooled serverless Postgres (Neon/pgbouncer) happy.
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const client = postgres(url, { prepare: false, max: 5 });
    _db = drizzle(client, { schema });
  }
  return _db;
}

export { schema };
