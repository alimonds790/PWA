"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  groups,
  groupMembers,
  pots,
  potMembers,
  cycles,
  obligations,
  paymentClaims,
  confirmations,
} from "@/db/schema";
import { getSession } from "@/lib/session";
import { randomToken } from "@/lib/crypto";
import { normalizePhone } from "@/lib/otp";
import { writeAudit } from "@/lib/audit";

async function requireAdmin(groupId: number) {
  const session = await getSession();
  if (!session) redirect("/login");
  const [group] = await db()
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.adminUserId, session.uid)));
  if (!group) redirect("/dashboard");
  return { session, group };
}

export async function addMember(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const { session } = await requireAdmin(groupId);

  const name = String(formData.get("name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (!name) redirect(`/g/${groupId}`);

  await db().transaction(async (tx) => {
    const [member] = await tx
      .insert(groupMembers)
      .values({ groupId, displayName: name, phone, accessToken: randomToken() })
      .returning();

    // v1 single-pot UI: every added member joins the group's (only) pot.
    // Pot membership stays a proper subset table for multi-pot later.
    const groupPots = await tx
      .select()
      .from(pots)
      .where(and(eq(pots.groupId, groupId), isNull(pots.archivedAt)));
    if (groupPots.length === 1) {
      await tx
        .insert(potMembers)
        .values({ potId: groupPots[0].id, groupMemberId: member.id });
    }

    await writeAudit(tx, {
      entityType: "group_member",
      entityId: member.id,
      action: "create",
      actorId: `user:${session.uid}`,
      after: { displayName: name, phone },
    });
  });

  redirect(`/g/${groupId}`);
}

export async function openCycle(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const potId = Number(formData.get("potId"));
  const { session } = await requireAdmin(groupId);

  const periodLabel = String(formData.get("periodLabel") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim() || null;
  if (!periodLabel || !/^\d+(\.\d{1,2})?$/.test(amountRaw) || parseFloat(amountRaw) <= 0) {
    redirect(`/g/${groupId}`);
  }
  const amount = parseFloat(amountRaw).toFixed(2);

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
      // equal split, "amount per member" (MEMORY.md D6); collector is not a
      // pot member in v1 so he never owes himself.
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
      after: { potId, periodLabel, amount, dueDate },
    });
  });

  redirect(`/g/${groupId}`);
}

// Confirm/reject: APPEND a confirmation row (never touch the claim), then
// recompute the obligation's derived status.
async function actOnClaim(formData: FormData, status: "confirmed" | "rejected") {
  const groupId = Number(formData.get("groupId"));
  const claimId = Number(formData.get("claimId"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const { session } = await requireAdmin(groupId);

  await db().transaction(async (tx) => {
    // claim → obligation → cycle → pot, all inside this group
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

    // The actor is the pot's collector; only the collector's user may act.
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
