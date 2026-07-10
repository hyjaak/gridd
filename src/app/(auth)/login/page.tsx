"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/LoadingScreen";

/**
 * `/login` is legacy — auth is on the home landing. Preserve bookmarks by redirecting.
 */
export default function LoginPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/?modal=login");
  }, [router]);
  return <LoadingScreen />;
}
