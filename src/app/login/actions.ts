"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, groupMembers, consents } from "@/db/schema";
import { normalizePhone, sendOtp, verifyOtp } from "@/lib/otp";
import { createSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type LoginState = {
  step: "phone" | "code";
  phone?: string;
  echo?: string;
  error?: "invalidPhone" | "invalidCode";
};

export async function requestOtp(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { step: "phone", error: "invalidPhone" };
  const { echo } = await sendOtp(phone);
  return { step: "code", phone, echo };
}

export async function verifyLogin(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const phone = String(formData.get("phone") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!verifyOtp(phone, code)) return { step: "code", phone, error: "invalidCode" };

  const d = db();
  let user = (await d.select().from(users).where(eq(users.phone, phone)))[0];
  if (!user) {
    user = await d.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ phone, displayName: phone })
        .returning();
      await writeAudit(tx, {
        entityType: "user",
        entityId: u.id,
        action: "create",
        actorId: `user:${u.id}`,
        after: { phone },
      });
      // Versioned consent (brief §7): the login screen shows the consent
      // line; continuing = grant. Purpose changes later require a new row.
      const [c] = await tx
        .insert(consents)
        .values({
          subjectType: "user",
          subjectId: u.id,
          policyVersion: "v1.0-demo",
          purposes: ["payment_record", "otp_login"],
        })
        .returning();
      await writeAudit(tx, {
        entityType: "consent",
        entityId: c.id,
        action: "create",
        actorId: `user:${u.id}`,
        after: { policyVersion: "v1.0-demo", purposes: ["payment_record", "otp_login"] },
      });
      return u;
    });
  }

  // "Member later registers" path (schema: group_members.user_id nullable):
  // any member row carrying this verified phone now links to this account,
  // so the person can recover their history and act as a pot collector.
  const linked = await d
    .update(groupMembers)
    .set({ userId: user.id })
    .where(and(eq(groupMembers.phone, phone), isNull(groupMembers.userId)))
    .returning({ id: groupMembers.id });
  for (const row of linked) {
    await writeAudit(d, {
      entityType: "group_member",
      entityId: row.id,
      action: "link_user",
      actorId: `user:${user.id}`,
      after: { userId: user.id },
    });
  }

  await createSession(user.id, phone);
  redirect("/dashboard");
}
