"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  groupMembers,
  pots,
  potMembers,
  cycles,
  obligations,
  paymentClaims,
  confirmations,
} from "@/db/schema";
import { getSession } from "@/lib/session";
import { getGroupAccess, type GroupAccess } from "@/lib/authz";
import { randomToken } from "@/lib/crypto";
import { normalizePhone } from "@/lib/otp";
import { writeAudit } from "@/lib/audit";

async function requireAccess(groupId: number): Promise<{ session: NonNullable<Awaited<ReturnType<typeof getSession>>>; access: GroupAccess }> {
  const session = await getSession();
  if (!session) redirect("/login");
  const access = await getGroupAccess(groupId, session);
  if (!access) redirect("/dashboard");
  return { session, access };
}

export async function addMember(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const { session, access } = await requireAccess(groupId);
  if (!access.isAdmin) redirect(`/g/${groupId}`);

  const name = String(formData.get("name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const chosenPotIds = formData.getAll("potIds").map(Number).filter(Number.isFinite);
  if (!name) redirect(`/g/${groupId}`);

  await db().transaction(async (tx) => {
    const [member] = await tx
      .insert(groupMembers)
      .values({ groupId, displayName: name, phone, accessToken: randomToken() })
      .returning();

    const groupPots = await tx
      .select()
      .from(pots)
      .where(and(eq(pots.groupId, groupId), isNull(pots.archivedAt)));
    // Single pot: auto-join (pot concept hidden). Multi-pot: join the
    // checked subset — pot membership is a proper subset of the group.
    const joinIds =
      groupPots.length === 1
        ? [groupPots[0].id]
        : groupPots.filter((p) => chosenPotIds.includes(p.id)).map((p) => p.id);
    for (const potId of joinIds) {
      await tx.insert(potMembers).values({ potId, groupMemberId: member.id });
    }

    await writeAudit(tx, {
      entityType: "group_member",
      entityId: member.id,
      action: "create",
      actorId: `user:${session.uid}`,
      after: { displayName: name, phone, potIds: joinIds },
    });
  });

  redirect(`/g/${groupId}`);
}

// Trips: several people collected for different things — each gets a pot
// with exactly one collector and its own member subset (invariant #8).
export async function createPot(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const { session, access } = await requireAccess(groupId);
  if (!access.isAdmin) redirect(`/g/${groupId}`);

  const name = String(formData.get("name") ?? "").trim();
  const collectorMemberId = Number(formData.get("collectorMemberId"));
  const memberIds = formData.getAll("memberIds").map(Number).filter(Number.isFinite);
  if (!name || !Number.isFinite(collectorMemberId)) redirect(`/g/${groupId}`);

  await db().transaction(async (tx) => {
    const members = await tx
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.archivedAt)));
    const valid = new Set(members.map((m) => m.id));
    if (!valid.has(collectorMemberId)) return;

    const [pot] = await tx
      .insert(pots)
      .values({ groupId, name, collectorMemberId })
      .returning();

    // Subset only; the collector never owes into their own pot.
    const joiners = memberIds.filter((id) => valid.has(id) && id !== collectorMemberId);
    for (const groupMemberId of joiners) {
      await tx.insert(potMembers).values({ potId: pot.id, groupMemberId });
    }

    await writeAudit(tx, {
      entityType: "pot",
      entityId: pot.id,
      action: "create",
      actorId: `user:${session.uid}`,
      after: { name, collectorMemberId, memberIds: joiners },
    });
  });

  redirect(`/g/${groupId}`);
}

// The member link IS the member's credential; rotation revokes a leaked or
// lost link. The old token dies, history is untouched (archive-never-delete
// applies to rows, not credentials).
export async function rotateMemberToken(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const memberId = Number(formData.get("memberId"));
  const { session, access } = await requireAccess(groupId);
  if (!access.isAdmin) redirect(`/g/${groupId}`);

  await db().transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId)));
    if (!member) return;
    await tx
      .update(groupMembers)
      .set({ accessToken: randomToken() })
      .where(eq(groupMembers.id, memberId));
    await writeAudit(tx, {
      entityType: "group_member",
      entityId: memberId,
      action: "rotate_token",
      actorId: `user:${session.uid}`,
    });
  });

  redirect(`/g/${groupId}`);
}

export async function openCycle(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const potId = Number(formData.get("potId"));
  const { session, access } = await requireAccess(groupId);
  // Admin or this pot's collector may open a cycle.
  if (!access.isAdmin && !access.collectorPotIds.has(potId)) redirect(`/g/${groupId}`);

  const periodLabel = String(formData.get("periodLabel") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim() || null;
  const okAmount = (s: string) => /^\d+(\.\d{1,2})?$/.test(s) && parseFloat(s) > 0;
  if (!periodLabel || !okAmount(amountRaw)) redirect(`/g/${groupId}`);
  const defaultAmount = parseFloat(amountRaw).toFixed(2);

  await db().transaction(async (tx) => {
    const [pot] = await tx
      .select()
      .from(pots)
      .where(and(eq(pots.id, potId), eq(pots.groupId, groupId)));
    if (!pot) return;

    const [cycle] = await tx
      .insert(cycles)
      .values({ potId, periodLabel, dueDate })
      .returning();

    const payers = await tx
      .select()
      .from(potMembers)
      .where(eq(potMembers.potId, potId));

    for (const p of payers) {
      // Per-member override (custom split) beats the equal default.
      const overrideRaw = String(formData.get(`override_${p.groupMemberId}`) ?? "").trim();
      const amount = okAmount(overrideRaw)
        ? parseFloat(overrideRaw).toFixed(2)
        : defaultAmount;
      const [ob] = await tx
        .insert(obligations)
        .values({ cycleId: cycle.id, groupMemberId: p.groupMemberId, amountDue: amount })
        .returning();
      await writeAudit(tx, {
        entityType: "obligation",
        entityId: ob.id,
        action: "create",
        actorId: `user:${session.uid}`,
        after: { cycleId: cycle.id, groupMemberId: p.groupMemberId, amountDue: amount },
      });
    }

    await writeAudit(tx, {
      entityType: "cycle",
      entityId: cycle.id,
      action: "create",
      actorId: `user:${session.uid}`,
      after: { potId, periodLabel, defaultAmount, dueDate },
    });
  });

  redirect(`/g/${groupId}`);
}

// Confirm/reject: APPEND a confirmation row (never touch the claim), then
// recompute the obligation's derived status. Only the pot's collector acts.
async function actOnClaim(formData: FormData, status: "confirmed" | "rejected") {
  const groupId = Number(formData.get("groupId"));
  const claimId = Number(formData.get("claimId"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const { session } = await requireAccess(groupId);

  await db().transaction(async (tx) => {
    const [row] = await tx
      .select({
        claim: paymentClaims,
        obligation: obligations,
        pot: pots,
      })
      .from(paymentClaims)
      .innerJoin(obligations, eq(paymentClaims.obligationId, obligations.id))
      .innerJoin(cycles, eq(obligations.cycleId, cycles.id))
      .innerJoin(pots, eq(cycles.potId, pots.id))
      .where(and(eq(paymentClaims.id, claimId), eq(pots.groupId, groupId)));
    if (!row) return;

    const [collector] = await tx
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.id, row.pot.collectorMemberId));
    if (!collector || collector.userId !== session.uid) return;

    const [conf] = await tx
      .insert(confirmations)
      .values({
        paymentClaimId: claimId,
        actorMemberId: collector.id,
        status,
        note,
      })
      .returning();

    const before = row.obligation.status;
    await tx
      .update(obligations)
      .set({ status })
      .where(eq(obligations.id, row.obligation.id));

    await writeAudit(tx, {
      entityType: "confirmation",
      entityId: conf.id,
      action: "create",
      actorId: `member:${collector.id}`,
      after: { paymentClaimId: claimId, status, note },
    });
    await writeAudit(tx, {
      entityType: "obligation",
      entityId: row.obligation.id,
      action: "status_change",
      actorId: `member:${collector.id}`,
      before: { status: before },
      after: { status },
    });
  });

  redirect(`/g/${groupId}`);
}

export async function confirmClaim(formData: FormData) {
  await actOnClaim(formData, "confirmed");
}

export async function rejectClaim(formData: FormData) {
  await actOnClaim(formData, "rejected");
}
