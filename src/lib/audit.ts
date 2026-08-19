import { db } from "@/db";
import { auditLog } from "@/db/schema";

// Every mutation writes an audit row inside the same transaction (PLAN §6).
type Db = ReturnType<typeof db>;
type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function writeAudit(
  tx: Executor,
  entry: {
    entityType: string;
    entityId: number;
    action: string;
    actorId: string; // 'user:<id>' | 'member:<id>' | 'system'
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.insert(auditLog).values({
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    actorId: entry.actorId,
    beforeJson: entry.before ?? null,
    afterJson: entry.after ?? null,
  });
}
