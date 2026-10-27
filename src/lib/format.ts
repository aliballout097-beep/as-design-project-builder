/** Presentation helpers shared by the UI, PDF renderer and n8n payloads. */

export function formatMoney(amount: number | null | undefined, currency = "USD", options: { compact?: boolean } = {}): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  if (options.compact && Math.abs(amount) >= 1000) {
    const value = amount / 1000;
    const digits = Math.abs(value) >= 100 || Number.isInteger(value) ? 0 : 1;
    return `${currencySymbol(currency)}${value.toFixed(digits)}k`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? `${currency} `;
  } catch {
    return `${currency} `;
  }
}

export function formatRange(min: number, max: number, currency = "USD"): string {
  if (!min && !max) return "—";
  if (min === max) return formatMoney(min, currency, { compact: true });
  return `${formatMoney(min, currency, { compact: true })} – ${formatMoney(max, currency, { compact: true })}`;
}

export function formatWeeks(weeks: number): string {
  const rounded = Math.round(weeks * 2) / 2;
  // Short phases read better in days ("3–4 days" rather than "0.5 weeks").
  if (rounded < 1) return "3–4 days";
  return `${rounded} week${rounded === 1 ? "" : "s"}`;
}

export function formatDate(value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", ...options }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, { hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(value: string | Date | null | undefined, now = Date.now()): string {
  if (!value) return "—";
  const time = typeof value === "string" ? new Date(value).getTime() : value.getTime();
  const seconds = Math.round((time - now) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day");
  return formatDate(new Date(time));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
