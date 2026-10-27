import type { NextConfig } from "next";

/**
 * Static security headers applied to every response.
 *
 * Frame-embedding rules (CSP `frame-ancestors` / `X-Frame-Options`) are NOT set
 * here: they depend on the runtime `EMBED_ALLOWED_ORIGINS` value, so `src/proxy.ts`
 * applies them per request (next.config headers are baked in at build time).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // microphone=(self) allows the Project Builder's voice notes (this app and its
    // own /embed iframe); camera/geolocation stay disallowed — nothing here uses them.
    value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // `NEXT_OUTPUT=standalone` is set by the Dockerfile; Vercel manages its own output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  // react-pdf ships its own font/layout engines; keep it out of the server bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // Trace from this project, never from a parent folder that happens to hold a lockfile.
  outputFileTracingRoot: process.cwd(),
  // Files the PDF renderer loads at runtime that file tracing can't see. Hosts that deploy only
  // traced files (Hostinger, Vercel, Docker standalone) otherwise fail with
  // "Cannot find module …/pdfkit/js/standard-fonts/Helvetica.cjs": pdfkit's ESM build loads its
  // built-in fonts through createRequire(), which resolves the .cjs files, while the tracer only
  // follows the .mjs ones. The PDF is rendered from many routes (auto-send after intake, the n8n
  // callback, approve, the portal download, the sweeper), so this applies to every route.
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/pdfkit/js/standard-fonts/**/*",
      "./node_modules/pdfkit/js/data/**/*",
      "./node_modules/pdfkit/js/pdfkit.js",
      "./node_modules/@fontsource/fraunces/files/*latin-*.woff",
      "./node_modules/@fontsource/hanken-grotesk/files/*latin-*.woff",
      "./node_modules/@fontsource/cairo/files/*arabic-*.woff",
      "./public/brand/am-*.png",
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        // The embed loader is requested cross-origin from asdesignlb.com.
        source: "/widget.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=3600" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
