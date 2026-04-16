"use client";

import Cookies from "js-cookie";
import type { UserRole } from "@/types";

/** Client-readable cookies so middleware sees the session on the next navigation without delay. */
const SESSION = "gridd-session";
const ROLE = "gridd-role";
const AGR = "gridd-agreements-ok";

const opts = { expires: 7, path: "/", sameSite: "lax" as const };

export function setClientSessionCookies(
  uid: string,
  role: UserRole,
  agreementsOk: boolean,
) {
  Cookies.set(SESSION, uid, opts);
  Cookies.set(ROLE, role, opts);
  Cookies.set(AGR, agreementsOk ? "1" : "0", opts);
}

export function clearClientSessionCookies() {
  Cookies.remove(SESSION, { path: "/" });
  Cookies.remove(ROLE, { path: "/" });
  Cookies.remove(AGR, { path: "/" });
}
