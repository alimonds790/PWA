import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export function secret(): string {
  return process.env.AUTH_SECRET || "dev-only-insecure-secret";
}

export function hmac(data: string, key = secret()): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
