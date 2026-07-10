"use client";

import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { doc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";

let registered: string | null = null;

/**
 * Register web push (FCM) for the current driver and save the token on `providers/{uid}`.
 * Requires `NEXT_PUBLIC_FCM_VAPID_KEY` and `/public/firebase-messaging-sw.js`.
 */
export async function registerProviderFcmIfNeeded(uid: string): Promise<void> {
  if (typeof window === "undefined" || !firebaseApp) return;
  if (uid !== firebaseAuth?.currentUser?.uid) return;
  const vapid = process.env.NEXT_PUBLIC_FCM_VAPID_KEY?.trim();
  if (!vapid) return;

  const supported = await isSupported().catch(() => false);
  if (!supported) return;
  if (registered === uid) return;

  try {
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, { vapidKey: vapid, serviceWorkerRegistration: reg });
    if (!token) return;
    const db = getFirestore(firebaseApp);
    await updateDoc(doc(db, "providers", uid), {
      fcmToken: token,
      fcmUpdatedAt: serverTimestamp(),
    });
    registered = uid;
  } catch {
    /* ignore */
  }
}
