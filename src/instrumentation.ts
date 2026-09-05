// Runs once per server boot (Next.js instrumentation hook). Applies pending
// Drizzle migrations automatically so a fresh Vercel + Neon deploy needs no
// manual `db:migrate` step. Idempotent (drizzle tracks applied migrations);
// set AUTO_MIGRATE=0 to disable and manage migrations by hand.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AUTO_MIGRATE === "0") return;
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[auto-migrate] DATABASE_URL not set — skipping");
    return;
  }
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { default: postgres } = await import("postgres");
  const path = await import("path");

  const client = postgres(url, { max: 1, prepare: false });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    console.log("[auto-migrate] schema up to date");
  } catch (e) {
    console.error("[auto-migrate] failed:", e);
  } finally {
    await client.end({ timeout: 5 });
  }
}
