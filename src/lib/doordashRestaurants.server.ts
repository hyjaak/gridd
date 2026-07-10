import "server-only";

import { createDoorDashJwt } from "@/lib/doordashDrive.server";
import { adminDb } from "@/lib/firebase-admin";
import type { BitesDoordashMenuItem, DoorDashLinkedBusiness } from "@/types/bitesDoordash";

const DOORDASH_BASE = "https://openapi.doordash.com";
const NOMINATIM_UA = "GRIDD/1.0 (bites-geo; https://gridd.click)";

function safeDocId(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 150) || "unknown";
}

async function doorDashGetJson(path: string): Promise<unknown> {
  const url = path.startsWith("http") ? path : `${DOORDASH_BASE}${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${createDoorDashJwt()}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(`DoorDash ${res.status}: ${text.slice(0, 280)}`);
  }
  return json;
}

/** Best-effort geocode for distance / map; failures return null. */
async function geocodeAddressUs(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = address.trim();
  if (!q) return null;
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("q", q);
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", "1");
  u.searchParams.set("countrycodes", "us");
  const res = await fetch(u.toString(), {
    headers: {
      "User-Agent": NOMINATIM_UA,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const arr = (await res.json().catch(() => [])) as { lat?: string; lon?: string }[];
  const hit = arr[0];
  if (!hit?.lat || !hit?.lon) return null;
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

type DDBusiness = {
  external_business_id?: string;
  name?: string;
};

type DDStore = {
  external_business_id?: string;
  external_store_id?: string;
  name?: string;
  address?: string;
  phone_number?: string;
  status?: string;
};

function mapToLinked(
  b: DDBusiness,
  s: DDStore,
  source: DoorDashLinkedBusiness["source"],
  extra?: { lat?: number; lng?: number; dist?: number },
): DoorDashLinkedBusiness {
  const extBiz = b.external_business_id ?? "unknown";
  const extSt = s.external_store_id ?? "default";
  const id = `${extBiz}__${extSt}`;
  const lat = extra?.lat ?? 0;
  const lng = extra?.lng ?? 0;
  return {
    id: safeDocId(id),
    doordashId: extBiz,
    externalBusinessId: extBiz,
    externalStoreId: extSt,
    name: s.name || b.name || "Partner store",
    address: s.address || "",
    phone: s.phone_number || "+10000000000",
    lat,
    lng,
    cuisine: ["Partner"],
    rating: 4.6,
    deliveryTime: "25–40 min",
    deliveryFee: 3.99,
    minOrder: 10,
    imageUrl: "",
    isOpen: (s.status ?? "active") === "active",
    priceRange: "$$",
    source,
    distanceMiles: extra?.dist,
  };
}

async function listAllBusinesses(): Promise<DDBusiness[]> {
  const out: DDBusiness[] = [];
  let token: string | null = null;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams();
    if (token) q.set("continuation_token", token);
    const path = `/developer/v1/businesses${q.toString() ? `?${q.toString()}` : ""}`;
    const raw = (await doorDashGetJson(path)) as {
      result?: DDBusiness[];
      continuation_token?: string | null;
    };
    const batch = raw.result ?? [];
    out.push(...batch);
    token = raw.continuation_token ?? null;
    if (!token) break;
  }
  return out;
}

async function listStoresForBusiness(extBiz: string): Promise<DDStore[]> {
  const out: DDStore[] = [];
  let token: string | null = null;
  for (let j = 0; j < 20; j++) {
    const q = new URLSearchParams();
    if (token) q.set("continuation_token", token);
    const path = `/developer/v1/businesses/${encodeURIComponent(extBiz)}/stores${q.toString() ? `?${q.toString()}` : ""}`;
    const raw = (await doorDashGetJson(path)) as {
      result?: DDStore[];
      continuation_token?: string | null;
    };
    const batch = raw.result ?? [];
    out.push(...batch);
    token = raw.continuation_token ?? null;
    if (!token) break;
  }
  return out;
}

/**
 * Lists businesses + stores from your Drive developer account and normalizes for Bites.
 * When DoorDash credentials are missing or the API returns an error, returns [].
 */
export async function fetchDeveloperBusinessesDoorDash(): Promise<DoorDashLinkedBusiness[]> {
  if (!process.env.DOORDASH_DEVELOPER_ID || !process.env.DOORDASH_KEY_ID || !process.env.DOORDASH_SIGNING_SECRET) {
    return [];
  }
  try {
    const businesses = await listAllBusinesses();
    const results: DoorDashLinkedBusiness[] = [];
    let geocodes = 0;
    const MAX_GEO = 8;
    for (const b of businesses) {
      const ext = b.external_business_id;
      if (!ext) continue;
      const stores = await listStoresForBusiness(ext);
      for (const s of stores) {
        let lat = 0;
        let lng = 0;
        if (s.address && geocodes < MAX_GEO) {
          geocodes += 1;
          const g = await geocodeAddressUs(s.address);
          if (g) {
            lat = g.lat;
            lng = g.lng;
          }
        }
        results.push(mapToLinked(b, s, "doordash_developer", { lat, lng }));
      }
    }
    return results;
  } catch (e) {
    console.error("[bites] fetchDeveloperBusinessesDoorDash", e);
    return [];
  }
}

/**
 * Filters developer-linked stores to those within `radiusMiles` of (lat, lng) when coords exist.
 */
export async function fetchNearbyBusinessesDoorDash(
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<DoorDashLinkedBusiness[]> {
  const all = await fetchDeveloperBusinessesDoorDash();
  const hasCoords = all.some((b) => b.lat !== 0 || b.lng !== 0);
  const origin = { lat, lng };
  if (!hasCoords) {
    return all.map((b) => ({ ...b, source: "doordash_nearby" as const }));
  }
  return all
    .map((b) => {
      const d = haversineMiles(origin, { lat: b.lat, lng: b.lng });
      return { ...b, source: "doordash_nearby" as const, distanceMiles: d };
    })
    .filter((b) => b.distanceMiles! <= radiusMiles)
    .sort((a, b) => a.distanceMiles! - b.distanceMiles!);
}

function normalizeMenuItem(id: string, raw: Record<string, unknown>): BitesDoordashMenuItem {
  const price = typeof raw.price === "number" ? raw.price : Number(raw.price ?? 0);
  return {
    id: safeDocId(String(raw.id ?? id)),
    name: String(raw.name ?? "Item"),
    description: String(raw.description ?? ""),
    price: price > 1000 ? price / 100 : price,
    category: String(raw.category ?? "Menu"),
    imageUrl: String(raw.imageUrl ?? raw.img_url ?? ""),
    isAvailable: raw.isAvailable !== false && raw.is_available !== false,
    calories: Number(raw.calories ?? 0),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    options: Array.isArray(raw.options) ? (raw.options as unknown[]) : [],
  };
}

/**
 * Menu: Firestore cache first, then best-effort Drive/Marketplace shape (often empty in Drive-only).
 */
export async function fetchBusinessMenuDoorDash(businessId: string): Promise<BitesDoordashMenuItem[]> {
  const safe = safeDocId(businessId);
  if (adminDb) {
    try {
      const snap = await adminDb.collection("restaurants").doc(safe).collection("menu").limit(200).get();
      if (!snap.empty) {
        return snap.docs.map((d) => {
          const raw = d.data() as Record<string, unknown>;
          return normalizeMenuItem(d.id, { ...raw, id: d.id });
        });
      }
    } catch {
      /* ignore */
    }
  }

  if (!process.env.DOORDASH_DEVELOPER_ID) return [];

  const tryPaths = [
    `/drive/v2/businesses/${encodeURIComponent(businessId)}/menus`,
    `/drive/v2/businesses/${encodeURIComponent(businessId.split("__")[0] ?? businessId)}/menus`,
  ];

  for (const p of tryPaths) {
    try {
      const raw = (await doorDashGetJson(p)) as {
        menu_categories?: { name?: string; items?: Record<string, unknown>[] }[];
      };
      const out: BitesDoordashMenuItem[] = [];
      for (const cat of raw.menu_categories ?? []) {
        for (const item of cat.items ?? []) {
          const id = String((item as { id?: string }).id ?? `item_${out.length}`);
          out.push(
            normalizeMenuItem(id, {
              ...item,
              category: cat.name ?? "Menu",
            }),
          );
        }
      }
      if (out.length) return out;
    } catch {
      /* try next */
    }
  }

  return [];
}
