"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function DriverProfilePage() {
  const router = useRouter();
  const { loading, ok } = useRequireAuth(["driver"]);

  useEffect(() => {
    if (!ok) return;
    router.replace("/profile");
  }, [ok, router]);

  if (loading || !ok) return <LoadingScreen />;
  return <LoadingScreen />;
}
