/** Deterministic back targets — avoids history loops. */
export const SMART_BACK_MAP: Record<string, string> = {
  "/book": "/home",
  "/track": "/home",
  "/wallet": "/home",
  "/history": "/home",
  "/profile": "/home",
  "/porch": "/home",
  "/agreements": "/",
  "/signup": "/",
  "/login": "/",
  "/jobs": "/",
  "/active": "/jobs",
  "/driver/jobs": "/",
  "/driver/active": "/driver/jobs",
  "/driver/earnings": "/driver/jobs",
  "/driver/profile": "/driver/jobs",
  "/admin/jobs": "/admin/dashboard",
  "/admin/security": "/admin/dashboard",
  "/admin/revenue": "/admin/dashboard",
  "/admin/messages": "/admin/dashboard",
  "/admin/providers": "/admin/dashboard",
};

export const SMART_BACK_ROOT_SCREENS = new Set([
  "/",
  "/home",
  "/jobs",
  "/driver/jobs",
  "/admin/dashboard",
]);

export function smartBackDestination(pathname: string): string {
  if (SMART_BACK_MAP[pathname]) return SMART_BACK_MAP[pathname];
  if (pathname.startsWith("/track/") && pathname !== "/track") return "/track";
  if (pathname.startsWith("/checkout/")) return "/book";
  if (pathname.startsWith("/messages/")) return "/home";
  if (pathname.startsWith("/admin/")) return "/admin/dashboard";
  return "/home";
}
