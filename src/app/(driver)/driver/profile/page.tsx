"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getUserRole } from "@/lib/userRole";
import { DriverNav } from "@/components/DriverNav";
import { LogoutButton } from "@/components/LogoutButton";

export default function DriverProfilePage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = user;
      if (!u) return;
      const r = await getUserRole(u.uid);
      if (cancelled) return;
      if (r === "customer") router.replace("/home");
      else if (r === "admin") router.replace("/admin/dashboard");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  return (
    <main className="min-h-full bg-[#060606] px-6 pb-36 pt-16 sm:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Driver · Profile</h1>
        <LogoutButton />
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        Settings, identity, and vehicle details — expand here next.
      </p>
      <DriverNav />
    </main>
  );
}
