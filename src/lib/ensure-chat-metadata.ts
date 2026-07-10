import { doc, getFirestore, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";
import { sanitizeForFirestore } from "@/lib/sanitizeFirestore";

/** Ensures `chats/{jobId}` exists with participants + createdAt (merge). */
export async function ensureChatMetadata(
  db: Firestore,
  jobId: string,
  opts: { participants: string[] },
): Promise<void> {
  const clean = [...new Set(opts.participants.filter(Boolean))];
  await setDoc(
    doc(db, "chats", jobId),
    sanitizeForFirestore({
      participants: clean,
      createdAt: serverTimestamp(),
    }),
    { merge: true },
  );
}

export function getDb(firebaseApp: import("firebase/app").FirebaseApp) {
  return getFirestore(firebaseApp);
}
