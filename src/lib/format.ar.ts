/** Arabic-locale presentation helpers for the client portal (kept separate from `format.ts`, which the English admin dashboard also uses). */

/** Arabic plural rules for "week": 1 أسبوع، 2 أسبوعين، 3–10 أسابيع، 11+ أسبوعاً. */
export function formatWeeksAr(weeks: number): string {
  const rounded = Math.round(weeks * 2) / 2;
  if (rounded < 1) return "3–4 أيام";
  if (rounded === 1) return "أسبوع واحد";
  if (rounded === 2) return "أسبوعين";
  return `${rounded} ${rounded <= 10 ? "أسابيع" : "أسبوعاً"}`;
}

/** "28 تشرين الأول 2026" — Arabic month names with Western digits (as used in Lebanon). */
export function formatDateAr(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : value;
  return new Intl.DateTimeFormat("ar-LB-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
