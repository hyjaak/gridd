import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Production is reachable both as the custom domain and as *.vercel.app.
 * Redirect the deployment hostname to NEXT_PUBLIC_APP_URL (e.g. https://gridd.click).
 * Preview (*.vercel.app) is unchanged — VERCEL_ENV is not "production" there.
 */
export function proxy(request: NextRequest) {
  const canonical = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (canonical && process.env.VERCEL_ENV === "production") {
    const host = request.headers.get("host") ?? "";
    if (host.endsWith(".vercel.app")) {
      try {
        const target = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical);
        return NextResponse.redirect(target, 308);
      } catch {
        /* fall through */
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
