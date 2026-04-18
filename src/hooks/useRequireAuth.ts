"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types";

type Allowed = UserRole;

/**
 * Waits for global auth, then ensures user exists and role is allowed; otherwise redirects.
 * Returns `ready` only when safe to render protected content (no flash of wrong role).
 */
export function useRequireAuth(allowedRoles: Allowed[]) {
  const { user, profile, role, loading } = useAuth();
  const router = useRouter();
  const allowedKey = allowedRoles.join("|");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!role) {
      router.replace("/");
      return;
    }
    const allowed = allowedKey.split("|") as Allowed[];
    if (!allowed.includes(role)) {
      if (role === "driver") router.replace("/jobs");
      else if (role === "admin") router.replace("/admin/dashboard");
      else router.replace("/home");
    }
  }, [loading, user, role, router, allowedKey]);

  const ok =
    !loading &&
    !!user &&
    !!role &&
    allowedRoles.includes(role);

  return { loading, ok, user, role, profile };
}
