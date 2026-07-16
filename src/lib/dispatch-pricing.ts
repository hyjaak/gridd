import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface DispatchPriceRates {
  deliveryBase: number;
  errandBase: number;
  haulingBase: number;
  includedMiles: number;
  perMile: number;
  haulingPerMile: number;
  heavyItemFee: number;
}

export const DISPATCH_DEFAULT_RATES: DispatchPriceRates = {
  deliveryBase: 45,
  errandBase: 45,
  haulingBase: 75,
  includedMiles: 8,
  perMile: 2,
  haulingPerMile: 2.5,
  heavyItemFee: 15,
};

export type DispatchServiceId = "delivery" | "errand" | "hauling";

export function suggestPrice(
  jobType: DispatchServiceId,
  miles: number,
  heavyItems = 0,
  rates: DispatchPriceRates = DISPATCH_DEFAULT_RATES
): { price: number; miles: number } {
  const base =
    jobType === "delivery"
      ? rates.deliveryBase
      : jobType === "errand"
      ? rates.errandBase
      : rates.haulingBase;

  const extra = Math.max(0, miles - rates.includedMiles);
  const mileRate = jobType === "hauling" ? rates.haulingPerMile : rates.perMile;
  const raw = base + extra * mileRate + heavyItems * rates.heavyItemFee;
  const price = Math.ceil(Math.max(raw, base) / 5) * 5;

  return { price, miles };
}

let ratesPromise: Promise<DispatchPriceRates> | null = null;

export async function loadDispatchRates(): Promise<DispatchPriceRates> {
  if (ratesPromise) return ratesPromise;
  ratesPromise = (async () => {
    try {
      const snap = await getDoc(doc(db, "systemConfig", "dispatchConfig"));
      if (snap.exists()) {
        const d = snap.data();
        if (d.pricing) {
          return { ...DISPATCH_DEFAULT_RATES, ...d.pricing } as DispatchPriceRates;
        }
      }
    } catch {
      /* silent — fallback to DISPATCH_DEFAULT_RATES */
    }
    return DISPATCH_DEFAULT_RATES;
  })();
  return ratesPromise;
}