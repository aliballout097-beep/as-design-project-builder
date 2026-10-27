import { brand } from "@/config/brand";

/**
 * Plain-JavaScript snippets embedded into n8n Code nodes. Written without
 * template literals so they can be concatenated safely.
 */

export const ESCAPE_JS = String.raw`function esc(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function money(value, currency) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value || 0); }
  catch (e) { return (currency || "USD") + " " + Math.round(value || 0); }
}`;

/** Branded, table-based email layout (inline styles for email clients). */
export const EMAIL_LAYOUT_JS =
  String.raw`var BRAND = ` +
  JSON.stringify({ name: brand.name, monogram: brand.monogram, ember: brand.colors.ember, ink: brand.colors.ink, email: brand.contactEmail, site: brand.siteUrl }) +
  String.raw`;
function emailLayout(opts) {
  var cta = opts.ctaUrl ? '<tr><td style="padding:8px 40px 32px"><a href="' + esc(opts.ctaUrl) + '" style="display:inline-block;background:' + BRAND.ember + ';color:#06060a;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:999px;font-size:15px">' + esc(opts.ctaLabel || "Open") + '</a></td></tr>' : "";
  return '<!doctype html><html><body style="margin:0;background:#efece6;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1b19">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fbfaf7;border-radius:20px;overflow:hidden">' +
    '<tr><td style="background:' + BRAND.ink + ';padding:28px 40px;color:#f4f1ea"><span style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;border:1px solid #3a3a46;border-radius:50%;font-family:Georgia,serif">' + esc(BRAND.monogram) + '</span>' +
    '<span style="margin-left:12px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#b3aea7">' + esc(BRAND.name) + '</span>' +
    '<h1 style="margin:28px 0 0;font-family:Georgia,serif;font-weight:400;font-size:30px;line-height:1.2;color:#f4f1ea">' + esc(opts.title) + '</h1></td></tr>' +
    '<tr><td style="padding:32px 40px 8px;font-size:15px;line-height:1.7;color:#2c2a27">' + opts.bodyHtml + '</td></tr>' + cta +
    '<tr><td style="padding:20px 40px 32px;border-top:1px solid #e7e2d9;font-size:12px;color:#6f6a63">' + esc(BRAND.name) + ' · <a href="mailto:' + esc(BRAND.email) + '" style="color:#6f6a63">' + esc(BRAND.email) + '</a></td></tr>' +
    '</table></td></tr></table></body></html>';
}`;
