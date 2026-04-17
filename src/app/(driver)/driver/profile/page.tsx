"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getUserRole } from "@/lib/userRole";

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
      else router.replace("/profile");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  return (
    <main className="min-h-full bg-[#060606] px-6 pb-36 pt-16 sm:pt-10">
      <p className="text-sm text-zinc-500">Redirecting…</p>
    </main>
  );
}
