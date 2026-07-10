import admin, { adminDb } from "@/lib/firebase-admin";
import { saveNotificationAndPush } from "@/lib/notify-internal";

export type CeoAlertPriority = "high" | "medium" | "low";

export type CreateCeoAlertInput = {
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
  priority?: CeoAlertPriority;
  /** Skip FCM even when high (e.g. batch) */
  skipPush?: boolean;
};

/**
 * Resolve CEO user IDs: env `GRIDD_CEO_UIDS` (comma-separated) and/or Firestore `users` where role == ceo.
 */
export async function getCeoRecipientUids(): Promise<string[]> {
  const fromEnv = (process.env.GRIDD_CEO_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!adminDb) return fromEnv;

  const out = new Set<string>(fromEnv);
  try {
    const snap = await adminDb.collection("users").where("role", "==", "ceo").limit(10).get();
    for (const d of snap.docs) out.add(d.id);
  } catch {
    /* ignore */
  }
  return [...out];
}

/**
 * Write `ceoAlerts/{id}` (Admin SDK) and optionally FCM to each CEO for high priority.
 */
export async function createCeoAlertServer(input: CreateCeoAlertInput): Promise<{ id: string } | null> {
  if (!adminDb) return null;
  const priority: CeoAlertPriority = input.priority ?? "medium";
  const ref = await adminDb.collection("ceoAlerts").add({
    type: input.type,
    message: input.message,
    metadata: input.metadata ?? {},
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    priority,
  });

  if (!input.skipPush && priority === "high") {
    const uids = await getCeoRecipientUids();
    for (const uid of uids) {
      await saveNotificationAndPush({
        userId: uid,
        event: "ceo_alert",
        title: "GRIDD CEO alert",
        body: input.message.slice(0, 180),
        icon: "🚨",
        color: "#ff6b00",
      }).catch(() => null);
    }
  }

  return { id: ref.id };
}
