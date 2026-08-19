"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  groupMembers,
  obligations,
  paymentClaims,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";

const METHODS = ["instapay", "wallet", "cash", "bank", "other"] as const;
type Method = (typeof METHODS)[number];

export async function submitClaim(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const obligationId = Number(formData.get("obligationId"));
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const paidDate = String(formData.get("paidDate") ?? "").trim();
  const rawMethod = String(formData.get("method") ?? "other");
  const method: Method = (METHODS as readonly string[]).includes(rawMethod)
    ? (rawMethod as Method)
    : "other";
  const referenceNumber = String(formData.get("referenceNumber") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (
    !token ||
    !/^\d+(\.\d{1,2})?$/.test(amountRaw) ||
    parseFloat(amountRaw) <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(paidDate)
  ) {
    redirect(`/m/${token}`);
  }
  const amount = parseFloat(amountRaw).toFixed(2);

  await db().transaction(async (tx) => {
    // Token is the member's identity: the obligation must belong to them.
    const [member] = await tx
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.accessToken, token), isNull(groupMembers.archivedAt)));
    if (!member) return;

    const [ob] = await tx
      .select()
      .from(obligations)
      .where(and(eq(obligations.id, obligationId), eq(obligations.groupMemberId, member.id)));
    if (!ob || ob.status === "confirmed") return;

    const [claim] = await tx
      .insert(paymentClaims)
      .values({ obligationId, amount, paidDate, method, referenceNumber, note })
      .returning();

    const before = ob.status;
    await tx
      .update(obligations)
      .set({ status: "claimed" })
      .where(eq(obligations.id, obligationId));

    await writeAudit(tx, {
      entityType: "payment_claim",
      entityId: claim.id,
      action: "create",
      actorId: `member:${member.id}`,
      after: { obligationId, amount, paidDate, method, referenceNumber },
    });
    await writeAudit(tx, {
      entityType: "obligation",
      entityId: obligationId,
      action: "status_change",
      actorId: `member:${member.id}`,
      before: { status: before },
      after: { status: "claimed" },
    });
  });

  redirect(`/m/${token}`);
}
