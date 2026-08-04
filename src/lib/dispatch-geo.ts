import type { MarketKey } from "@/lib/constants";

export type GeoPoint = { lat: number; lng: number };
export type AddressSuggestion = { label: string; lat: number; lng: number };

/** Google Maps deep link — the real map app does the finding, not us. */
export function mapsUrl(street: string | undefined, city: string | undefined, state?: string): string {
  const q = [street, city, state].filter(Boolean).join(", ");
  return `https://maps.google.com/?q=${encodeURIComponent(q || city || "")}`;
}

const MARKET_CENTERS: Record<MarketKey, GeoPoint> = {
  OH: { lat: 39.7589, lng: -84.1916 },
  GA: { lat: 33.9412, lng: -84.2135 },
};

/**
 * Search an address via Photon (free, OSM-based, no API key).
 * Biased to the market's city center. Min 3 chars.
 * Returns up to 5 suggestions with {label, lat, lng}.
 */
export async function searchAddress(
  q: string,
  market: MarketKey
): Promise<AddressSuggestion[]> {
  const trimmed = q.trim();
  if (trimmed.length < 3) return [];

  const center = MARKET_CENTERS[market];
  const stateSuffix = market === "OH" ? ", OH" : ", GA";
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed + stateSuffix)}&limit=5&lat=${center.lat}&lon=${center.lng}`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);

    if (!res.ok) return [];

    const data = await res.json();
    if (!data.features || !Array.isArray(data.features)) return [];

    return data.features
      .filter((f: any) => {
        if (!f.geometry?.coordinates) return false;
        const [lng, lat] = f.geometry.coordinates;
        // Reject results outside 60-mile radius of market center
        const distMiles = haversineMiles(center, { lat, lng });
        return distMiles <= 60;
      })
      .map((f: any) => {
        const [lng, lat] = f.geometry.coordinates;
        const label = f.properties.name
          ? [f.properties.name, f.properties.city, f.properties.state]
              .filter(Boolean)
              .join(", ")
          : f.properties.osm_value || f.properties.osm_key || "Unknown";
        return { label, lat, lng };
      })
      .slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Reverse-geocode a lat/lng via Photon (free, no API key).
 * Returns a street-ish label or null on failure.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data.features?.[0];
    if (!f?.properties) return null;
    const p = f.properties;
    const street = p.name || p.street || "";
    const city = p.city || p.town || p.village || "";
    const parts = [street, city].filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  } catch {
    return null;
  }
}

/**
 * Driving miles between two points via OSRM (free, no API key).
 * Falls back to haversine * 1.3 on any failure.
 */
export async function drivingMiles(
  a: GeoPoint,
  b: GeoPoint
): Promise<number> {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);

    if (!res.ok) return haversineMiles(a, b) * 1.3;

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) {
      return haversineMiles(a, b) * 1.3;
    }

    return Math.round((data.routes[0].distance / 1609.34) * 10) / 10;
  } catch {
    return haversineMiles(a, b) * 1.3;
  }
}

/** Haversine distance in miles */
function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}