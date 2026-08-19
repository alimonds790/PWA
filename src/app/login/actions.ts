"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
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
    user = (
      await d
        .insert(users)
        .values({ phone, displayName: phone })
        .returning()
    )[0];
    await writeAudit(d, {
      entityType: "user",
      entityId: user.id,
      action: "create",
      actorId: `user:${user.id}`,
      after: { phone },
    });
  }
  await createSession(user.id, phone);
  redirect("/dashboard");
}
