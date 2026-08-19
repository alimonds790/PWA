"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { groups, groupMembers, pots, users } from "@/db/schema";
import { getSession } from "@/lib/session";
import { randomToken } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";

const GROUP_TYPES = ["building", "apartment", "family", "trip", "custom"] as const;
type GroupTypeV = (typeof GROUP_TYPES)[number];

export async function createGroup(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const yourName = String(formData.get("yourName") ?? "").trim();
  const rawType = String(formData.get("type") ?? "custom");
  const type: GroupTypeV = (GROUP_TYPES as readonly string[]).includes(rawType)
    ? (rawType as GroupTypeV)
    : "custom";
  if (!name || !yourName) redirect("/dashboard");

  const groupId = await db().transaction(async (tx) => {
    await tx
      .update(users)
      .set({ displayName: yourName })
      .where(eq(users.id, session.uid));

    const [group] = await tx
      .insert(groups)
      .values({ name, type, adminUserId: session.uid })
      .returning();

    // The collector is a group member too (roles as data, not hard-coded).
    const [collector] = await tx
      .insert(groupMembers)
      .values({
        groupId: group.id,
        displayName: yourName,
        phone: session.phone,
        userId: session.uid,
        accessToken: randomToken(),
      })
      .returning();

    // Pot exists from day one; UI hides it while the group has exactly one.
    const [pot] = await tx
      .insert(pots)
      .values({
        groupId: group.id,
        name,
        collectorMemberId: collector.id,
        recurrence: type === "trip" ? "none" : "monthly",
      })
      .returning();

    const actorId = `user:${session.uid}`;
    await writeAudit(tx, { entityType: "group", entityId: group.id, action: "create", actorId, after: { name, type } });
    await writeAudit(tx, { entityType: "group_member", entityId: collector.id, action: "create", actorId, after: { displayName: yourName, role: "collector" } });
    await writeAudit(tx, { entityType: "pot", entityId: pot.id, action: "create", actorId, after: { name, collectorMemberId: collector.id } });
    return group.id;
  });

  redirect(`/g/${groupId}`);
}
