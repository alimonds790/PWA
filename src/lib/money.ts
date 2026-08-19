// Money is stored as numeric(12,2) strings; do arithmetic in integer
// piastres to avoid float drift (MEMORY.md D5).

export function toPiastres(amount: string | number): number {
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  return Math.round(n * 100);
}

export function fromPiastres(p: number): string {
  return (p / 100).toFixed(2);
}

export function sum(amounts: (string | number)[]): string {
  return fromPiastres(amounts.reduce<number>((acc, a) => acc + toPiastres(a), 0));
}

export function fmt(amount: string | number, locale: "ar" | "en"): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    style: "currency",
    currency: "EGP",
    currencyDisplay: "code",
  }).format(n);
}
