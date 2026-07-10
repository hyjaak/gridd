"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/LoadingScreen";

/**
 * `/signup` is legacy — auth is on the home landing. `?role=driver` opens driver signup.
 */
export default function SignupPage() {
  const router = useRouter();
  useEffect(() => {
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const r = q?.get("role");
    if (r === "driver") router.replace("/?modal=driverSignup");
    else router.replace("/?modal=signup");
  }, [router]);
  return <LoadingScreen />;
}
