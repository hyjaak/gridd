"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GriddLandingPage } from "@/components/landing/gridd-landing";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/hooks/useAuth";

/**
 * `/` — World-class marketing landing for visitors; signed-in users route to the right app surface.
 */
export default function HomePage() {
  const router = useRouter();
  const { user, profile, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!profile || !role) {
      router.replace("/onboarding");
      return;
    }

    const required =
      role === "driver"
        ? (["terms", "privacy", "zerotolerance", "provider_agreement"] as const)
        : (["terms", "privacy", "zerotolerance"] as const);
    const signed = profile.agreementsSigned ?? [];
    if (!required.every((d) => signed.includes(d))) {
      router.replace("/terms");
      return;
    }
    if (role === "ceo") {
      router.replace("/admin/dashboard");
      return;
    }
    if (profile.onboardingComplete !== true) {
      router.replace("/onboarding");
      return;
    }
    if (role === "driver") {
      router.replace("/driver/jobs");
      return;
    }
    router.replace("/home");
  }, [loading, user, profile, role, router]);

  /* Signed-out: always show marketing (do not block on initial auth check). */
  if (!user) return <GriddLandingPage />;

  if (loading) return <LoadingScreen />;

  /* Signed in: routing happens in useEffect — avoid a second full-screen GRIDD loader that never resolves if replace stalls. */
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#060606] px-6 text-center text-sm text-zinc-500">
      <p className="text-zinc-400">Opening your GRIDD workspace…</p>
      <div
        className="h-8 w-8 shrink-0 rounded-full border-2 border-[#00FF88] border-t-transparent animate-spin"
        aria-hidden
      />
    </div>
  );
}
