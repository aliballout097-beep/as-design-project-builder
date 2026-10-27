import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Network-boundary logic (Next.js 16 "proxy", formerly middleware):
 *   • optimistic auth for /admin pages (the data layer re-checks every request),
 *   • framing policy — only /embed may be framed, and only by EMBED_ALLOWED_ORIGINS,
 *   • noindex for private surfaces.
 */

const DEFAULT_EMBED_ORIGINS = ["https://asdesignlb.com", "https://www.asdesignlb.com"];

function embedOrigins(): string[] {
  const configured = (process.env.EMBED_ALLOWED_ORIGINS ?? "")
    .split(/[\s,]+/)
    .map((origin) => origin.trim())
    .filter((origin) => /^https?:\/\/[^\s'";]+$/.test(origin));
  const origins = configured.length ? configured : DEFAULT_EMBED_ORIGINS;
  return process.env.NODE_ENV === "production" ? origins : [...origins, "http://localhost:*", "http://127.0.0.1:*"];
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const login = request.nextUrl.clone();
      login.pathname = "/admin/login";
      login.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(login);
    }
  }

  const response = NextResponse.next();
  const embeddable = pathname === "/embed" || pathname.startsWith("/embed/");
  response.headers.set(
    "Content-Security-Policy",
    `frame-ancestors ${embeddable ? ["'self'", ...embedOrigins()].join(" ") : "'self'"}`,
  );
  if (!embeddable) response.headers.set("X-Frame-Options", "SAMEORIGIN");
  if (pathname.startsWith("/admin") || pathname.startsWith("/p/") || embeddable) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|widget.js|robots.txt|sitemap.xml).*)"],
};
