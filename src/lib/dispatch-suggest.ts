import { searchAddress, drivingMiles } from "@/lib/dispatch-geo";
import { suggestPrice, loadDispatchRates, type DispatchServiceId } from "@/lib/dispatch-pricing";
import type { StopAddress } from "@/types/dispatch";

export type SuggestResult = { price: number; miles: number };

/**
 * ⚡ Suggest — geocodes pickup/dropoff (free Photon), computes OSRM driving miles
 * (haversine×1.3 fallback), and returns a suggested flat price rounded to $5.
 * Failure = null (caller keeps manual input). On-demand only — never auto-spam.
 */
export async function suggestForStops(
  pickup: StopAddress | undefined,
  dropoff: StopAddress | undefined,
  jobType: string,
  market?: string
): Promise<SuggestResult | null> {
  const p = pickup?.street || pickup?.city;
  const d = dropoff?.street || dropoff?.city;
  if (!p || !d) return null;
  const m = market === "ATL" ? "GA" : "OH";
  try {
    const [pa, da] = await Promise.all([
      searchAddress(p, m),
      searchAddress(d, m),
    ]);
    if (!pa.length || !da.length) return null;
    const miles = Math.max(1, await drivingMiles(
      { lat: pa[0].lat, lng: pa[0].lng },
      { lat: da[0].lat, lng: da[0].lng },
    ));
    const rates = await loadDispatchRates();
    const type = (["delivery", "errand", "hauling"].includes(jobType) ? jobType : "delivery") as DispatchServiceId;
    const { price } = suggestPrice(type, miles, 0, rates);
    return { price, miles: Math.ceil(miles * 10) / 10 };
  } catch {
    return null;
  }
}