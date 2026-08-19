"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { destroySession } from "@/lib/session";

export async function toggleLocale() {
  const jar = await cookies();
  const next = jar.get("locale")?.value === "en" ? "ar" : "en";
  jar.set("locale", next, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  const referer = (await headers()).get("referer");
  let back = "/";
  if (referer) {
    try {
      back = new URL(referer).pathname || "/";
    } catch {}
  }
  redirect(back);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
