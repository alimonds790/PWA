import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { groups, groupMembers, pots } from "@/db/schema";
import type { Session } from "./session";

// Roles are data (brief §3): a user can reach a group as its admin, as the
// collector of one or more of its pots, or both. Trips are the common
// multi-collector case — admin organises, others collect their own pots.
export type GroupAccess = {
  group: typeof groups.$inferSelect;
  isAdmin: boolean;
  /** pot ids in this group whose collector is the current user */
  collectorPotIds: Set<number>;
};

export async function getGroupAccess(
  groupId: number,
  session: Session,
): Promise<GroupAccess | null> {
  const d = db();
  const [group] = await d.select().from(groups).where(eq(groups.id, groupId));
  if (!group || group.archivedAt) return null;

  const isAdmin = group.adminUserId === session.uid;

  const collectorPots = await d
    .select({ potId: pots.id })
    .from(pots)
    .innerJoin(groupMembers, eq(pots.collectorMemberId, groupMembers.id))
    .where(
      and(
        eq(pots.groupId, groupId),
        isNull(pots.archivedAt),
        eq(groupMembers.userId, session.uid),
      ),
    );
  const collectorPotIds = new Set(collectorPots.map((p) => p.potId));

  if (!isAdmin && collectorPotIds.size === 0) return null;
  return { group, isAdmin, collectorPotIds };
}
