import { NextResponse } from "next/server";

type Body = {
  origin?: { lat?: number; lng?: number };
  destination?: { lat?: number; lng?: number };
};

/**
 * Server-side Distance Matrix proxy — uses the same API key as the client Maps script.
 * Enable "Distance Matrix API" in Google Cloud for this project.
 */
export async function POST(req: Request) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "Maps key not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const oLat = body?.origin?.lat;
  const oLng = body?.origin?.lng;
  const dLat = body?.destination?.lat;
  const dLng = body?.destination?.lng;

  if (
    typeof oLat !== "number" ||
    typeof oLng !== "number" ||
    typeof dLat !== "number" ||
    typeof dLng !== "number" ||
    !Number.isFinite(oLat) ||
    !Number.isFinite(oLng) ||
    !Number.isFinite(dLat) ||
    !Number.isFinite(dLng)
  ) {
    return NextResponse.json({ ok: false, error: "Invalid origin or destination" }, { status: 400 });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("units", "metric");
  url.searchParams.set("origins", `${oLat},${oLng}`);
  url.searchParams.set("destinations", `${dLat},${dLng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("departure_time", String(Math.floor(Date.now() / 1000)));
  url.searchParams.set("traffic_model", "best_guess");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status?: string;
    rows?: Array<{
      elements?: Array<{
        status?: string;
        distance?: { value: number };
        duration?: { value: number };
        duration_in_traffic?: { value: number };
      }>;
    }>;
  };

  if (data.status !== "OK") {
    return NextResponse.json(
      { ok: false, error: data.status ?? "Distance Matrix error" },
      { status: 502 },
    );
  }

  const el = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== "OK" || typeof el.distance?.value !== "number") {
    return NextResponse.json(
      { ok: false, error: el?.status ?? "No route" },
      { status: 400 },
    );
  }

  const durationSec =
    typeof el.duration_in_traffic?.value === "number"
      ? el.duration_in_traffic.value
      : el.duration?.value ?? 0;

  return NextResponse.json({
    ok: true,
    meters: el.distance.value,
    durationSeconds: durationSec,
    /** True when the response used live traffic (duration_in_traffic). */
    usedTraffic: typeof el.duration_in_traffic?.value === "number",
  });
}
