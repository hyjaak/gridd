/**
 * Nominatim (OSM) — US ZIP centroid for PriceIQ™ board / cron.
 * Respect usage policy: cache-friendly, one-shot per request.
 */
export async function nominatimZipCenter(zip5: string): Promise<{ lat: number; lng: number } | null> {
  const z = zip5.replace(/\D/g, "").slice(0, 5);
  if (z.length !== 5) return null;
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("format", "json");
  u.searchParams.set("country", "us");
  u.searchParams.set("postalcode", z);
  u.searchParams.set("limit", "1");
  try {
    const res = await fetch(u.toString(), {
      headers: { "User-Agent": "GRIDD/1.0 (price intelligence; contact support@gridd.app)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { lat?: string; lon?: string }[];
    const hit = data[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/** ~Northbound route of `miles` statute miles (rough; sufficient for market snapshot). */
export function offsetNorthMiles(lat: number, lng: number, miles: number): { lat: number; lng: number } {
  const dLat = miles / 69;
  return { lat: lat + dLat, lng };
}
