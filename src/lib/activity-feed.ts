import { addDoc, collection, getFirestore, serverTimestamp } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { sanitizeForFirestore } from "@/lib/sanitizeFirestore";

/**
 * Append a row to `activityFeed` (CEO-readable). Caller must be signed in; rules require userId === auth.uid.
 */
export async function logActivityEvent(opts: {
  db?: Firestore;
  type: string;
  userId: string;
  userName: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  if (!firebaseApp) return;
  const db = opts.db ?? getFirestore(firebaseApp);
  await addDoc(
    collection(db, "activityFeed"),
    sanitizeForFirestore({
      type: opts.type,
      userId: opts.userId,
      userName: opts.userName,
      description: opts.description,
      metadata: opts.metadata ?? {},
      timestamp: serverTimestamp(),
      seen: false,
    }),
  );
}
