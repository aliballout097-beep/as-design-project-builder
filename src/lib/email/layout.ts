import { brand } from "@/config/brand";

/**
 * Branded, table-based email layout with inline styles (the only thing every
 * email client renders reliably), in the AM logo's identity: the sky-blue
 * gradient band with the AM logo, navy type and an orange call to action.
 *
 * Deliverability notes baked in here:
 *   • always sent as multipart/alternative with a real plain-text part (see `toPlainText`)
 *   • no images or extra files at all: the AM logo is drawn in HTML text (navy "A",
 *     orange "M", "ALI MAWLA"), so it always shows and nothing but the PDF is attached
 *   • links only point at the studio's own domains
 *   • a hidden preheader so the inbox preview is meaningful instead of "View in browser"
 */

export const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const C = brand.colors;
const FONT_AR = "Tahoma, 'Segoe UI', Arial, sans-serif";
const FONT_EN = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

export interface EmailButton {
  label: string;
  url: string;
  /** Secondary buttons render as outlined navy. */
  secondary?: boolean;
}

export interface EmailLayoutOptions {
  appUrl: string;
  lang: "ar" | "en";
  /** Inbox preview line (hidden in the body). */
  preheader: string;
  title: string;
  /** Trusted HTML — escape every dynamic value with `esc()`. */
  bodyHtml: string;
  buttons?: EmailButton[];
  /** Small print under the buttons. */
  footnoteHtml?: string;
}

function button(b: EmailButton, font: string) {
  const style = b.secondary
    ? `display:inline-block;border:1px solid ${C.navy};color:${C.navy};background:#ffffff;`
    : `display:inline-block;border:1px solid ${C.ember};color:#ffffff;background:${C.ember};`;
  return `<a href="${esc(b.url)}" style="${style}text-decoration:none;font-family:${font};font-weight:bold;font-size:15px;line-height:20px;padding:13px 24px;border-radius:12px;margin:0 0 10px">${esc(b.label)}</a>`;
}

export function emailLayout(o: EmailLayoutOptions): string {
  const rtl = o.lang === "ar";
  const font = rtl ? FONT_AR : FONT_EN;
  const align = rtl ? "right" : "left";

  const buttons = o.buttons?.length
    ? `<tr><td style="padding:6px 32px 18px;text-align:${align}">${o.buttons.map((b) => button(b, font)).join("&nbsp;&nbsp;")}</td></tr>`
    : "";
  const footnote = o.footnoteHtml
    ? `<tr><td style="padding:0 32px 22px;font-family:${font};font-size:13px;line-height:21px;color:${C.mist};text-align:${align}">${o.footnoteHtml}</td></tr>`
    : "";
  const contact = [brand.contactEmail, brand.phoneDisplay].filter(Boolean).map(esc).join(" · ");
  const site = esc(new URL(brand.siteUrl).host);

  return `<!doctype html>
<html lang="${o.lang}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(o.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eaf6ff;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eaf6ff">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eaf6ff">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid ${C.line};border-radius:18px;overflow:hidden">
<tr><td align="center" style="background-color:${C.skyTop};background-image:linear-gradient(170deg,#c9f3fe 0%,${C.skyTop} 38%,${C.skyMid} 100%);padding:26px 24px 20px">
<div dir="ltr" style="font-family:Georgia,'Times New Roman',serif;font-size:46px;line-height:46px;font-weight:bold;letter-spacing:-2px"><span style="color:${C.navy}">A</span><span style="color:${C.ember}">M</span></div>
<div dir="ltr" style="margin-top:8px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:14px;font-weight:bold;letter-spacing:5px;color:${C.navy}">${esc(brand.wordmark)}</div>
</td></tr>
<tr><td style="padding:30px 32px 6px;font-family:${font};font-size:15px;line-height:26px;color:#22306b;text-align:${align}">
<h1 style="margin:0 0 16px;font-family:${font};font-size:23px;line-height:34px;font-weight:bold;color:${C.navy}">${esc(o.title)}</h1>
${o.bodyHtml}
</td></tr>
${buttons}
${footnote}
<tr><td style="padding:18px 32px 24px;border-top:1px solid ${C.line};font-family:${font};font-size:12px;line-height:19px;color:${C.mist};text-align:${align}">
<strong style="color:${C.navy}">${esc(brand.name)}</strong> · ${esc(brand.owner)}<br>
${contact} · <a href="${esc(brand.siteUrl)}" style="color:${C.mist};text-decoration:underline">${site}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** A two-column facts table (label → value); values are escaped here. */
export function factsTable(rows: [label: string, value: string | null | undefined][], lang: "ar" | "en"): string {
  const align = lang === "ar" ? "right" : "left";
  const font = lang === "ar" ? FONT_AR : FONT_EN;
  const body = rows
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(
      ([label, value]) =>
        `<tr><td style="padding:9px 12px;border-bottom:1px solid ${C.line};font-family:${font};font-size:13px;color:${C.mist};white-space:nowrap;vertical-align:top;text-align:${align}">${esc(label)}</td><td style="padding:9px 12px;border-bottom:1px solid ${C.line};font-family:${font};font-size:14px;color:${C.navy};font-weight:bold;text-align:${align}">${esc(value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;border:1px solid ${C.line};border-radius:12px;border-collapse:separate;overflow:hidden">${body}</table>`;
}

/** Highlight box, e.g. for the proposal total. */
export function callout(html: string, lang: "ar" | "en"): string {
  const align = lang === "ar" ? "right" : "left";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px"><tr><td style="background-color:#f2f8ff;border:1px solid ${C.line};border-${align === "right" ? "right" : "left"}:4px solid ${C.ember};border-radius:12px;padding:14px 16px;text-align:${align};font-size:15px;line-height:25px;color:${C.navy}">${html}</td></tr></table>`;
}

/**
 * Plain-text alternative. Spam filters penalise HTML-only mail, and some people
 * read mail as text — so every message carries one.
 */
export function toPlainText(html: string): string {
  return html
    .replace(/<(style|title|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<div style="display:none[\s\S]*?<\/div>/i, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      const url = href.replace(/&amp;/g, "&");
      return text && text !== url && !url.startsWith("mailto:") ? `${text}: ${url}` : text || url;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|tr|li|table|div)>/gi, "\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
