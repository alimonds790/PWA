import { hmac, safeEqual } from "./crypto";
import { smsProvider } from "./sms";

// Stateless OTP (MEMORY.md D2): 6 digits derived from HMAC(phone, timeslice).
// Valid for the current and previous 5-minute slice (~5–10 min window).
const SLICE_MS = 5 * 60 * 1000;

function codeFor(phone: string, slice: number): string {
  const digest = hmac(`otp:${phone}:${slice}`);
  const n = parseInt(Buffer.from(digest, "base64url").subarray(0, 4).toString("hex"), 16);
  return String(n % 1_000_000).padStart(6, "0");
}

export function normalizePhone(raw: string): string | null {
  let p = raw.replace(/[\s\-()]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (/^01\d{9}$/.test(p)) p = "+2" + p; // local Egyptian mobile
  if (!/^\+\d{10,15}$/.test(p)) return null;
  return p;
}

export async function sendOtp(phone: string): Promise<{ echo?: string }> {
  const code = codeFor(phone, Math.floor(Date.now() / SLICE_MS));
  await smsProvider().send(phone, `Your login code: ${code}`);
  // DEMO ONLY (COMPLIANCE.md §B6) — echoes OTP to the UI when no real SMS.
  if (process.env.DEV_OTP_ECHO === "1") return { echo: code };
  return {};
}

export function verifyOtp(phone: string, code: string): boolean {
  const slice = Math.floor(Date.now() / SLICE_MS);
  const c = code.trim();
  return safeEqual(codeFor(phone, slice), c) || safeEqual(codeFor(phone, slice - 1), c);
}
