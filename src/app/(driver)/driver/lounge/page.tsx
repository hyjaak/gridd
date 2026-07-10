"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db, firebaseApp } from "@/lib/firebase";
import { DriverLoungeChat } from "@/components/driver/DriverLoungeChat";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireSignedIn } from "@/hooks/useRequireSignedIn";
import { useAuth } from "@/hooks/useAuth";
import type { Provider } from "@/types";

export default function DriverLoungePage() {
  const { loading: gateLoading, ok } = useRequireSignedIn();
  const { user, role } = useAuth();
  const [provider, setProvider] = useState<Provider | null>(null);

  useEffect(() => {
    if (!firebaseApp || !user?.uid || role !== "driver") {
      setProvider(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "providers", user.uid), (snap) => {
      if (!snap.exists()) {
        setProvider(null);
        return;
      }
      setProvider({ uid: snap.id, ...(snap.data() as Omit<Provider, "uid">) });
    });
    return () => unsub();
  }, [user?.uid, role]);

  if (gateLoading || !ok) return <LoadingScreen />;

  return <DriverLoungeChat userId={user?.uid} provider={provider} role={role} />;
}
