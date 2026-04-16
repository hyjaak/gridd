import admin, { adminAuth, adminDb } from "@/lib/firebase-admin";

const CRITICAL_SMS_EVENTS = new Set([
  "driver_accepted",
  "driver_arriving",
  "payout_sent",
  "new_job",
]);

export type NotifyPayload = {
  userId: string;
  event: string;
  title: string;
  body: string;
  icon?: string;
  color?: string;
};

function requireDb() {
  if (!adminDb) throw new Error("Firebase Admin not configured.");
  return adminDb;
}

export async function saveNotificationAndPush(
  payload: NotifyPayload,
): Promise<{ id: string }> {
  const db = requireDb();
  const id = db.collection("notifications").doc().id;
  const createdAt = new Date().toISOString();
  const doc = {
    id,
    userId: payload.userId,
    event: payload.event,
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "🔔",
    color: payload.color ?? "#00FF88",
    read: false,
    createdAt,
  };
  await db.collection("notifications").doc(id).set(doc);

  const userSnap = await db.collection("users").doc(payload.userId).get();
  const fcmToken = userSnap.exists
    ? (userSnap.data() as { fcmToken?: string }).fcmToken
    : undefined;
  const phone = userSnap.exists
    ? (userSnap.data() as { phone?: string }).phone
    : undefined;

  if (fcmToken && admin.apps.length) {
    try {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          event: payload.event,
          notificationId: id,
        },
      });
    } catch {
      // Token invalid or FCM not enabled — ignore
    }
  }

  if (CRITICAL_SMS_EVENTS.has(payload.event) && phone) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const tok = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (sid && tok && from) {
      const twilio = (await import("twilio")).default;
      const client = twilio(sid, tok);
      await client.messages.create({
        to: phone,
        from,
        body: `${payload.title}: ${payload.body}`,
      });
    }
  }

  return { id };
}

/** Verify Firebase ID token for notify API (caller must be admin or same user). */
export async function verifyBearerUid(req: Request): Promise<string | null> {
  if (!adminAuth) return null;
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token) return null;
  const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
  return decoded?.uid ?? null;
}
