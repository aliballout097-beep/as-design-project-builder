/**
 * Brand & public-facing configuration. Safe for the browser: only reads
 * NEXT_PUBLIC_* variables (inlined at build time).
 */
export const brand = {
  name: "AS Design Studio",
  shortName: "AS Design",
  monogram: "AS",
  /** The studio's founder/principal strategist — used in the AI persona, PDF signature and portal. */
  owner: process.env.NEXT_PUBLIC_OWNER_NAME || "Ali Mawla",
  tagline: "Design-led digital studio",
  /** The studio's main marketing site (the Project Builder links back to it). */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://asdesignlb.com",
  /** The studio's portfolio — "see our work" buttons on the site, proposal page, email and PDF. */
  portfolioUrl: process.env.NEXT_PUBLIC_PORTFOLIO_URL || "https://asdesignlb.com/portfolio",
  /** Where this platform is hosted, e.g. https://automation.asdesignlb.com */
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  /** Public studio inbox — shown to clients and used as the email sender / reply-to. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "info@asdesignlb.com",
  /** Optional scheduling link (Calendly, Cal.com…) offered after submission / acceptance. */
  bookingUrl: process.env.NEXT_PUBLIC_BOOKING_URL || null,
  /** E.164 digits only (no "+"), e.g. "9613123456" — used by the WhatsApp kickoff button. */
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || null,
  /** Human-readable phone shown in the proposal PDF footer, e.g. "+961 3 123 456". Falls back to a formatted whatsappNumber. */
  phoneDisplay: process.env.NEXT_PUBLIC_PHONE_DISPLAY || (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ? `+${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER}` : null),
  /** Optional line shown in footers and the proposal PDF, e.g. "Beirut · Worldwide". */
  location: process.env.NEXT_PUBLIC_STUDIO_LOCATION || null,
  /**
   * The AM logo (navy "A" + orange "M") — every client-facing surface uses these
   * files, all derived from AM.jpeg: `am-mark.png` (transparent AM letters, for
   * small slots), `am-lockup.png` (AM + "ALI MAWLA" wordmark), `am-badge.png`
   * (AM on the logo's sky gradient — avatars, app icon) and `AM.jpeg` itself.
   */
  logoPath: "/brand/am-mark.png",
  logoFullPath: "/brand/am-lockup.png",
  logoBadgePath: "/brand/am-badge.png",
  logoEmailPath: "/brand/am-email.png",
  logoOriginalPath: "/brand/AM.jpeg",
  /** The wordmark in the logo lockup. */
  wordmark: "ALI MAWLA",
  /**
   * Palette taken from the AM logo (mirrored in the PDF renderer and the emails,
   * which cannot read CSS variables): navy "A", orange "M", and the sky-blue
   * gradient behind the logo in AM.jpeg.
   */
  colors: {
    navy: "#0a1669",
    navyDeep: "#060d45",
    ember: "#d2660a",
    emberDeep: "#b4560a",
    skyTop: "#9be7fc",
    skyMid: "#5cb6fd",
    skyBottom: "#3464ff",
    ink: "#0a1669",
    ivory: "#f7fbff",
    mist: "#5b6894",
    paper: "#ffffff",
    line: "#dfe7f6",
  },
} as const;

export type Brand = typeof brand;
