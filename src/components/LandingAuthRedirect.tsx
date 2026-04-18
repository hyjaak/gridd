"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import { syncSession } from "@/lib/auth";

/**
 * If Firebase has a restored session but httpOnly cookies are missing (new tab,
 * cleared cookies), sync and send the user to the right app route.
 */
export function LandingAuthRedirect() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (!firebaseAuth) return;

    const unsub = onAuthStateChanged(firebaseAuth, async (u) => {
      if (!u || ran.current) return;
      if (typeof window !== "undefined" && window.location.pathname !== "/") return;

      const synced = await syncSession();
      if (!synced.ok) return;

      ran.current = true;

      if (!synced.agreementsOk) {
        router.replace("/agreements");
        return;
      }

      /* Session cookies restored — let `app/page.tsx` route to onboarding / home / jobs */
    });

    return () => unsub();
  }, [router]);

  return null;
}
