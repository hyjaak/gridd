"use client";

import { Suspense } from "react";
import { ProfileRouter } from "@/components/profile/ProfileRouter";

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#060606] px-6 py-24 text-center text-zinc-500">Loading…</main>
      }
    >
      <ProfileRouter />
    </Suspense>
  );
}
