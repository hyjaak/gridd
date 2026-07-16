"use client";

import { MARKETS } from "@/lib/constants";
import type { MarketKey, ServiceId } from "@/lib/constants";

export type StopAddress = {
  street?: string;
  city: string;
  unit?: string;
  notes?: string;
};

export type BookingPayload = {
  jobType: ServiceId;
  pickupAddress: StopAddress;
  dropoffAddress: StopAddress;
  customerPhone: string;
  contactName?: string;
  description: string;
  timeWindow?: string;
  itemPhotoUrl?: string;
  market: MarketKey;
  estMiles?: number;
  estPrice?: number;
};

export async function submitBooking(payload: BookingPayload) {
  const digits = payload.customerPhone.replace(/\D/g, "");
  if (!digits || digits.length < 10) {
    throw new Error("Please enter a valid phone number");
  }
  const normalized = digits.length === 10 ? `+1${digits}` : `+${digits}`;

  // Validate at least street or city for each stop
  if (!payload.pickupAddress.street && !payload.pickupAddress.city) {
    throw new Error("Please enter a pickup address or city");
  }
  if (!payload.dropoffAddress.street && !payload.dropoffAddress.city) {
    throw new Error("Please enter a drop-off address or city");
  }

  const res = await fetch("/api/create-job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobType: payload.jobType,
      pickupAddress: {
        street: payload.pickupAddress.street?.trim() || "",
        city: payload.pickupAddress.city.trim(),
        unit: payload.pickupAddress.unit?.trim() || "",
        notes: payload.pickupAddress.notes?.trim() || "",
      },
      dropoffAddress: {
        street: payload.dropoffAddress.street?.trim() || "",
        city: payload.dropoffAddress.city.trim(),
        unit: payload.dropoffAddress.unit?.trim() || "",
        notes: payload.dropoffAddress.notes?.trim() || "",
      },
      customerPhone: normalized,
      contactName: payload.contactName?.trim() || "",
      description: payload.description.trim(),
      timeWindow: payload.timeWindow || "",
      itemPhotoUrl: payload.itemPhotoUrl || "",
      market: MARKETS[payload.market].code,
      estMiles: payload.estMiles,
      estPrice: payload.estPrice,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || "Failed to create job");
  }
}