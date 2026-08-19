// Invariant #3: the platform sends nothing. These build wa.me deep links
// that open the USER'S OWN WhatsApp with prefilled text; sending is theirs.

export function waLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}
