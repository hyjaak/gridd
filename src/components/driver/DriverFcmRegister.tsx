"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { registerProviderFcmIfNeeded } from "@/lib/fcm-register";

/** Registers FCM for push job alerts; no UI. */
export function DriverFcmRegister() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.uid) return;
    void registerProviderFcmIfNeeded(user.uid);
  }, [user?.uid]);
  return null;
}
