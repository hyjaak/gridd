import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function sessionUid(req: NextRequest) {
  return (
    req.cookies.get("gridd-session")?.value ||
    req.cookies.get("gridd_uid")?.value ||
    null
  );
}

function sessionRole(req: NextRequest) {
  return (
    req.cookies.get("gridd-role")?.value ||
    req.cookies.get("gridd_role")?.value ||
    null
  );
}

function agreementsOk(req: NextRequest) {
  const v =
    req.cookies.get("gridd-agreements-ok")?.value ||
    req.cookies.get("gridd_agreements_ok")?.value;
  return v === "1";
}

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/signup")) return true;
  if (pathname.startsWith("/agreements")) return true;
  if (pathname.startsWith("/api")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/robots")) return true;
  if (pathname.startsWith("/sitemap")) return true;
  return false;
}

function routeForRole(role: string) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "driver") return "/jobs";
  return "/home";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const uid = sessionUid(req);
  const role = sessionRole(req);
  const agr = agreementsOk(req);

  // Auth screens: signed-in users go into the app
  if (pathname === "/login" || pathname === "/signup") {
    if (uid && role) {
      if (!agr) {
        return NextResponse.redirect(new URL("/agreements", req.url));
      }
      return NextResponse.redirect(new URL(routeForRole(role), req.url));
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  if (!uid || !role) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (!agr && pathname !== "/agreements") {
    return NextResponse.redirect(new URL("/agreements", req.url));
  }

  if (role === "customer" && pathname === "/active") {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  const isAdminPath = pathname.startsWith("/admin");
  const isDriverApp =
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/active") ||
    pathname.startsWith("/driver") ||
    pathname.startsWith("/earnings");

  const isSharedJobPath = pathname.startsWith("/messages");

  /** Customer booking / wallet / order flows — not for drivers */
  const driverForbiddenCustomerRoutes =
    pathname === "/home" ||
    pathname.startsWith("/book") ||
    pathname.startsWith("/wallet") ||
    pathname.startsWith("/checkout") ||
    pathname === "/track" ||
    pathname.startsWith("/track/") ||
    pathname === "/history" ||
    pathname.startsWith("/history/");

  if (role === "admin") return NextResponse.next();

  if (role === "customer") {
    if (isAdminPath || isDriverApp) {
      return NextResponse.redirect(new URL("/home", req.url));
    }
    return NextResponse.next();
  }

  if (role === "driver") {
    if (isAdminPath) {
      return NextResponse.redirect(new URL("/jobs", req.url));
    }
    if (driverForbiddenCustomerRoutes && !isSharedJobPath) {
      return NextResponse.redirect(new URL("/jobs", req.url));
    }
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL(routeForRole(role), req.url));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
