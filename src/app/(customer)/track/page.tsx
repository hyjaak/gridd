"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { CustomerNav } from "@/components/CustomerNav";
import { useAuth } from "@/hooks/useAuth";
import { getUserRole } from "@/lib/userRole";

export default function CustomerTrackPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = user;
      if (!u) return;
      const r = await getUserRole(u.uid);
      if (cancelled) return;
      if (r === "driver") router.replace("/jobs");
      else if (r === "admin") router.replace("/admin/dashboard");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  return (
    <>
      <BackButton href="/home" />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-6 pb-36 pt-16 sm:pt-10">
        <h1 className="text-2xl font-semibold tracking-tight">Customer · Track</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Placeholder. This will show live job status and provider ETA.
        </p>
      </main>
      <CustomerNav />
    </>
  );
}

