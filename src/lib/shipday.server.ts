import { getJob, getUser, updateJob } from "@/lib/db";
import type { Job } from "@/types";

const SHIPDAY_ORDERS_URL = "https://api.shipday.com/orders";

function shipdayApiKey(): string | null {
  const k = process.env.SHIPDAY_API_KEY?.trim();
  return k || null;
}

function normalizePhone(raw: string | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length >= 10) {
    const tail = d.slice(-10);
    return `+1${tail}`;
  }
  return "+15555550100";
}

function customerAddress(job: Job): string | null {
  const d = job.dropoff?.address?.trim();
  if (d) return d;
  const line = job.addressLine?.trim();
  if (line) return line;
  return null;
}

function pickupAddress(job: Job): string | null {
  const p = job.pickup?.address?.trim();
  if (p) return p;
  const def = process.env.SHIPDAY_DEFAULT_PICKUP_ADDRESS?.trim();
  return def || null;
}

type InsertResponse = {
  success?: boolean;
  orderId?: number;
  response?: string;
  message?: string;
};

/**
 * After a job is paid, push a delivery order to Shipday when API key and addresses are configured.
 * Idempotent: skips if `job.shipdayOrderId` is already set.
 */
export async function syncPaidJobToShipday(jobId: string): Promise<void> {
  const apiKey = shipdayApiKey();
  if (!apiKey) return;

  const job = await getJob(jobId);
  if (!job || typeof job.shipdayOrderId === "number") return;

  const drop = customerAddress(job);
  const pick = pickupAddress(job);
  if (!drop || !pick) {
    console.info(`[shipday] skip job ${jobId}: need dropoff/addressLine and pickup or SHIPDAY_DEFAULT_PICKUP_ADDRESS`);
    return;
  }

  const user = await getUser(job.customerUid);
  const customerName =
    (job.customerName ?? user?.name ?? "GRIDD customer").trim() || "GRIDD customer";
  const phone = normalizePhone(user?.phone);

  const totalCents = job.chargedTotalCents ?? job.amountCents ?? 0;
  const tipCents = job.tipCents ?? 0;
  const totalUsd = Math.max(0, totalCents) / 100;
  const tipsUsd = Math.max(0, tipCents) / 100;

  const body: Record<string, unknown> = {
    orderNumber: job.id,
    customerName,
    customerAddress: drop,
    customerPhoneNumber: phone,
    customerEmail: user?.email ?? undefined,
    restaurantName: `GRIDD — ${job.serviceName}`,
    restaurantAddress: pick,
    paymentMethod: "credit_card",
    orderSource: "GRIDD",
    orderItem: [
      {
        name: job.serviceName,
        quantity: 1,
        unitPrice: Math.round((totalUsd - tipsUsd) * 100) / 100 || 0.01,
        detail: job.notes?.slice(0, 240) ?? undefined,
      },
    ],
    tips: tipsUsd,
    totalOrderCost: totalUsd || 0.01,
    deliveryInstruction: job.notes?.slice(0, 500) ?? undefined,
  };

  if (job.pickup && typeof job.pickup.lat === "number" && typeof job.pickup.lng === "number") {
    body.pickupLatitude = job.pickup.lat;
    body.pickupLongitude = job.pickup.lng;
  }
  if (job.dropoff && typeof job.dropoff.lat === "number" && typeof job.dropoff.lng === "number") {
    body.deliveryLatitude = job.dropoff.lat;
    body.deliveryLongitude = job.dropoff.lng;
  }

  const res = await fetch(SHIPDAY_ORDERS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as InsertResponse | null;
  if (!res.ok || !json?.success || typeof json.orderId !== "number") {
    console.warn(
      `[shipday] insert failed job=${jobId} status=${res.status}`,
      json ?? (await res.text().catch(() => "")),
    );
    return;
  }

  await updateJob(jobId, {
    shipdayOrderId: json.orderId,
    shipdaySyncedAt: new Date().toISOString(),
    shipdayLastEvent: "ORDER_INSERTED",
  });
}
