"use client";

import { useEffect, useRef } from "react";
import { doc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";

const BROADCAST_MS = 30_000;

/**
 * Writes `providers/{uid}.location` + `lastLocationUpdate` while enabled (driver online / eligible).
 * Uses watchPosition with coarse accuracy to limit battery use.
 */
export function useDriverLocationBroadcast(enabled: boolean, uid: string | undefined) {
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !uid || !firebaseApp || typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    const db = getFirestore(firebaseApp);
    const pref = doc(db, "providers", uid);

    let lastWrite = 0;
    const push = (lat: number, lng: number) => {
      const n = Date.now();
      if (n - lastWrite < BROADCAST_MS) return;
      lastWrite = n;
      void updateDoc(pref, {
        location: { lat, lng },
        lastLocationUpdate: serverTimestamp(),
        isOnline: true,
      } as Record<string, unknown>).catch(() => {});
    };

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        push(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        /* permission denied or unavailable — silent */
      },
      { enableHighAccuracy: false, maximumAge: BROADCAST_MS, timeout: 20_000 },
    );

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [enabled, uid]);
}
