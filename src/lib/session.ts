import { cookies } from "next/headers";
import { hmac, safeEqual } from "./crypto";

const COOKIE = "session";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export type Session = { uid: number; phone: string; exp: number };

function encode(s: Session): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

function decode(raw: string): Session | null {
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!safeEqual(hmac(body), sig)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    if (typeof s.uid !== "number" || s.exp < Date.now() / 1000) return null;
    return s;
  } catch {
    return null;
  }
}

export async function createSession(uid: number, phone: string) {
  const jar = await cookies();
  const s: Session = { uid, phone, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S };
  jar.set(COOKIE, encode(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  return raw ? decode(raw) : null;
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
