import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export type AdminDriverActionType = "approved" | "rejected" | "requested_docs" | "demo_enabled" | "demo_disabled";

export async function logAdminDriverAction(opts: {
  actionType: AdminDriverActionType;
  driverId: string;
  driverName: string;
  performedBy: string;
  reason?: string;
  requestNote?: string;
  ipAddress?: string;
}) {
  if (!adminDb) return;
  const ref = adminDb.collection("adminActions").doc();
  await ref.set({
    actionType: opts.actionType,
    driverId: opts.driverId,
    driverName: opts.driverName,
    performedBy: opts.performedBy,
    performedAt: FieldValue.serverTimestamp(),
    reason: opts.reason ?? null,
    requestNote: opts.requestNote ?? null,
    ipAddress: opts.ipAddress ?? null,
  });
}
