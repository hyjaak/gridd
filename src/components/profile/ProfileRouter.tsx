"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { CustomerProfile } from "./CustomerProfile";
import { DriverProfile } from "./DriverProfile";

export function ProfileRouter() {
  const { role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (role === "admin") router.replace("/admin/dashboard");
  }, [loading, role, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#060606] px-6 py-24 text-center text-zinc-500">
        Loading profile…
      </main>
    );
  }

  if (role === "driver") return <DriverProfile />;
  if (role === "customer") return <CustomerProfile />;
  return (
    <main className="min-h-screen bg-[#060606] px-6 py-24 text-center text-zinc-500">
      Sign in to view your profile.
    </main>
  );
}
