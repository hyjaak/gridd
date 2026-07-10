import { NextResponse } from "next/server";
import { formatNominatimAddress, type NominatimSearchHit } from "@/lib/nominatim";

export const runtime = "nodejs";

const UA = "GRIDD/1.0 (address-autocomplete; https://gridd.click)";

/**
 * Proxy for OpenStreetMap Nominatim — avoids browser CORS and sets a valid User-Agent (required by OSM).
 * GET ?q=search   — forward search (US-biased via countrycodes=us)
 * GET ?lat=&lng= — reverse geocode
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const q = searchParams.get("q")?.trim();

  if (lat !== null && lng !== null) {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      return NextResponse.json({ ok: false, error: "Invalid lat/lng" }, { status: 400 });
    }
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(la));
    url.searchParams.set("lon", String(ln));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "en-US,en",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "Reverse geocode failed" }, { status: 502 });
    }
    const data = (await res.json()) as NominatimSearchHit & { error?: string };
    if (data.error || !data.display_name) {
      return NextResponse.json({ ok: true, result: null });
    }
    const formattedAddress = formatNominatimAddress(data.display_name, data.address);
    const zip = data.address?.postcode;
    const plat = parseFloat(data.lat);
    const plng = parseFloat(data.lon);
    return NextResponse.json({
      ok: true,
      result: {
        formattedAddress,
        zip,
        lat: plat,
        lng: plng,
      },
    });
  }

  if (!q || q.length < 3) {
    return NextResponse.json({ ok: true, results: [] as unknown[] });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "us");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Accept-Language": "en-US,en",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: "Search failed" }, { status: 502 });
  }

  const raw = (await res.json()) as NominatimSearchHit[];
  const results = raw.map((hit) => ({
    ...hit,
    formattedLine: formatNominatimAddress(hit.display_name, hit.address),
  }));

  return NextResponse.json({ ok: true, results });
}
