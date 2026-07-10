import "server-only";

import jwt from "jsonwebtoken";
import { createHmac, timingSafeEqual } from "crypto";

const DOORDASH_BASE = "https://openapi.doordash.com";

export type DDPickup = {
  name: string;
  address: string;
  phone: string;
  instructions?: string;
};

export type DDDropoff = {
  name: string;
  address: string;
  phone: string;
  instructions?: string;
};

/**
 * Sign DoorDash Drive JWT per official docs (HS256, signing_secret as base64-decoded key).
 * @see https://developer.doordash.com/en-US/docs/drive/how_to/JWTs
 */
export function createDoorDashJwt(): string {
  const developerId = process.env.DOORDASH_DEVELOPER_ID;
  const keyId = process.env.DOORDASH_KEY_ID;
  const secretB64 = process.env.DOORDASH_SIGNING_SECRET;
  if (!developerId || !keyId || !secretB64) {
    throw new Error("Missing DOORDASH_DEVELOPER_ID, DOORDASH_KEY_ID, or DOORDASH_SIGNING_SECRET");
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 300; // 5m (per docs; max 30m)

  const data = {
    aud: "doordash",
    iss: developerId,
    kid: keyId,
    exp,
    iat,
  };

  const key = Buffer.from(secretB64, "base64");
  return jwt.sign(data, key, {
    algorithm: "HS256",
    // DoorDash requires `dd-ver` in JWT header (not in @types/jsonwebtoken JwtHeader)
    header: { alg: "HS256", typ: "JWT", "dd-ver": "DD-JWT-V1" } as jwt.JwtHeader,
  });
}

export async function createDoorDashDelivery(
  orderId: string,
  pickup: DDPickup,
  dropoff: DDDropoff,
  orderValueUsd: number,
  tipCents: number = 0,
): Promise<unknown> {
  const first = dropoff.name.trim().split(/\s+/);
  const given = first[0] ?? "Customer";
  const family = first.slice(1).join(" ") || " ";

  const body = {
    external_delivery_id: orderId,
    pickup_address: pickup.address,
    pickup_business_name: pickup.name,
    pickup_phone_number: pickup.phone,
    pickup_instructions: pickup.instructions ?? "",
    dropoff_address: dropoff.address,
    dropoff_contact_given_name: given,
    dropoff_contact_family_name: family,
    dropoff_contact_phone_number: dropoff.phone,
    dropoff_instructions: dropoff.instructions ?? "",
    order_value: Math.max(0, Math.round(orderValueUsd * 100)),
    tip: Math.max(0, Math.round(tipCents)),
    currency: "USD",
  };

  const res = await fetch(`${DOORDASH_BASE}/drive/v2/deliveries`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${createDoorDashJwt()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    throw new Error(
      `DoorDash create delivery failed (${res.status}): ${typeof json === "object" && json !== null ? JSON.stringify(json) : res.statusText}`,
    );
  }
  return json;
}

export async function getDoorDashDeliveryByExternalId(externalDeliveryId: string): Promise<unknown> {
  const res = await fetch(`${DOORDASH_BASE}/drive/v2/deliveries/${encodeURIComponent(externalDeliveryId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${createDoorDashJwt()}` },
  });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    throw new Error(`DoorDash get delivery failed (${res.status})`);
  }
  return json;
}

/** DoorDash Drive v2 — cancel (method per current API: PUT) */
export async function cancelDoorDashDelivery(externalDeliveryId: string): Promise<void> {
  const res = await fetch(`${DOORDASH_BASE}/drive/v2/deliveries/${encodeURIComponent(externalDeliveryId)}/cancel`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${createDoorDashJwt()}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`DoorDash cancel failed (${res.status}): ${t || res.statusText}`);
  }
}

/** Webhook HMAC verify — header name may vary; confirm in portal. */
export function verifyDoorDashWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secretB64 = process.env.DOORDASH_SIGNING_SECRET;
  if (!secretB64 || !signatureHeader) return false;
  const key = Buffer.from(secretB64, "base64");
  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signatureHeader.trim(), "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Best-effort mapping — DoorDash body shapes may vary by API version. */
export function parseDriveDeliveryResponse(json: unknown): {
  id: string;
  dasherName?: string;
  dasherPhoto?: string;
  dasherPhone?: string;
} {
  const o = json as Record<string, unknown>;
  const id = String(o.id ?? o.external_delivery_id ?? o.delivery_id ?? "");
  const dasher = o.dasher as Record<string, unknown> | undefined;
  const dName =
    (dasher?.name as string | undefined) ?? (o.dasher_name as string | undefined);
  const dPhoto = (dasher?.img_href as string | undefined) ?? (o.dasher_img as string | undefined);
  const dPhone = (dasher?.phone_number as string | undefined) ?? (o.dasher_phone as string | undefined);
  return { id, dasherName: dName, dasherPhoto: dPhoto, dasherPhone: dPhone };
}
