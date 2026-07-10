"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function BitesNewGroupPage() {
  const router = useRouter();
  useEffect(() => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto.randomUUID() as string).replace(/-/g, "").slice(0, 12)
        : String(Date.now());
    router.replace(`/bites/group/${id}`);
  }, [router]);
  return <LoadingScreen />;
}
