import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { saveNotificationAndPush } from "@/lib/notify-internal";

/**
 * Daily: CEO-approved drivers — commercial auto expiry on `providers.commercialAutoExpiry`.
 * 30 days / 7 days before end of coverage → push; after EOD of expiry day → suspend.
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Admin not configured" }, { status: 500 });
  }

  const snap = await adminDb.collection("providers").get();
  const now = Date.now();

  let reminder30 = 0;
  let reminder7 = 0;
  let suspended = 0;
  const errors: string[] = [];

  for (const d of snap.docs) {
    const data = d.data() as {
      accountStatus?: string;
      approvedByCEO?: boolean;
      commercialAutoExpiry?: unknown;
      commercialInsuranceReminded30dAt?: unknown;
      commercialInsuranceReminded7dAt?: unknown;
      suspensionReason?: string | null;
    };

    if (data.accountStatus !== "approved" || data.approvedByCEO !== true) continue;

    const exp = toDateFromFirestore(data.commercialAutoExpiry);
    if (!exp) continue;

    if (now > exp.getTime()) {
      try {
        await d.ref.update({
          accountStatus: "suspended",
          suspensionReason: "Insurance expired",
          isOnline: false,
          status: "off_gridd",
        });
        suspended++;
        await saveNotificationAndPush({
          userId: d.id,
          event: "insurance_expired",
          title: "Account suspended: insurance expired",
          body: "Your account has been suspended because your insurance expired. Upload valid insurance to reactivate your account.",
          icon: "🚫",
          color: "#EF4444",
        });
      } catch (e) {
        errors.push(`${d.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }

    const days = calendarDaysUntil(exp);

    if (days === 30 && !data.commercialInsuranceReminded30dAt) {
      try {
        await d.ref.update({ commercialInsuranceReminded30dAt: FieldValue.serverTimestamp() });
        await saveNotificationAndPush({
          userId: d.id,
          event: "insurance_expiry_30d",
          title: "Commercial insurance expiring",
          body: "⚠️ Your commercial auto insurance expires in 30 days. Upload your renewal to stay active on GRIDD.",
        });
        reminder30++;
      } catch (e) {
        errors.push(`${d.id} 30d: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (days === 7 && !data.commercialInsuranceReminded7dAt) {
      try {
        await d.ref.update({ commercialInsuranceReminded7dAt: FieldValue.serverTimestamp() });
        await saveNotificationAndPush({
          userId: d.id,
          event: "insurance_expiry_7d",
          title: "Urgent: insurance expiring in 7 days",
          body: "🚨 Insurance expires in 7 days! Upload renewal NOW to avoid account suspension.",
          color: "#F97316",
        });
        reminder7++;
      } catch (e) {
        errors.push(`${d.id} 7d: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    providers: snap.size,
    reminder30,
    reminder7,
    suspended,
    errors: errors.length ? errors : undefined,
  });
}

function toDateFromFirestore(val: unknown): Date | null {
  if (val == null) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (typeof val === "object" && "toDate" in val && typeof (val as { toDate: () => Date }).toDate === "function") {
    return (val as { toDate: () => Date }).toDate();
  }
  if (typeof val === "string") {
    const t = new Date(val).getTime();
    if (Number.isFinite(t)) return new Date(t);
  }
  return null;
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Full calendar days from start of local today to the expiry calendar day (EOD of commercial coverage). */
function calendarDaysUntil(expiry: Date) {
  const end = startOfLocalDay(expiry);
  const start = startOfLocalDay(new Date());
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}
