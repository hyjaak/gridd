"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getDriverAccess } from "@/lib/driver-gate";
import type { Provider } from "@/types";

/**
 * Hard gate from live provider snapshot:
 * upload → driver-docs; rejected → driver-rejected; pending → driver-pending;
 * demo + approved → stay on app routes.
 */
export function useDriverApprovalRedirect(provider: Provider | null | undefined, ready: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!ready || !provider) return;
    const access = getDriverAccess(provider);
    if (access === "account_banned") {
      router.replace("/driver/restricted?state=banned");
      return;
    }
    if (access === "account_hold") {
      router.replace("/driver/restricted?state=hold");
      return;
    }
    if (access === "account_suspended") {
      router.replace("/driver/restricted?state=suspended");
      return;
    }
    if (access === "upload") {
      router.replace("/signup/driver-docs");
      return;
    }
    if (access === "rejected") {
      router.replace("/driver-rejected");
      return;
    }
    if (access === "pending") {
      router.replace("/driver-pending");
      return;
    }
  }, [ready, provider, router]);
}
