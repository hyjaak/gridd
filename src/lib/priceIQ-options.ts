import type { PriceCalculationOptions } from "@/lib/calculatePrice";
import type { Urgency } from "@/types/booking";

/** Map booking form fields → PriceIQ calculator options. */
export function buildPriceIQOptions(
  service: string,
  form: Record<string, unknown>,
  urgency: Urgency,
): PriceCalculationOptions {
  const bookingUrgency = urgency;

  switch (service) {
    case "haul":
      return {
        bookingUrgency,
        weight: String(form.weight ?? "medium"),
        stairs: form.stairs === true ? 1 : 0,
        stairsFloors: Number(form.stairsFloors ?? 0),
        loadingHours: 1,
      };
    case "send":
      return {
        bookingUrgency,
        weight: String(form.sendSize ?? "medium"),
      };
    case "ride": {
      const sec = Number(form.routeDurationSeconds ?? 0);
      const p = form.pickupCoords as { lat?: number; lng?: number } | undefined;
      const d = form.dropoffCoords as { lat?: number; lng?: number } | undefined;
      return {
        bookingUrgency,
        rideType: String(form.rideType ?? "standard"),
        durationSeconds: sec > 0 ? sec : undefined,
        durationMinutes: sec > 0 ? sec / 60 : 15,
        pickupLat: typeof p?.lat === "number" ? p.lat : undefined,
        pickupLng: typeof p?.lng === "number" ? p.lng : undefined,
        dropoffLat: typeof d?.lat === "number" ? d.lat : undefined,
        dropoffLng: typeof d?.lng === "number" ? d.lng : undefined,
      };
    }
    case "lawn":
      return {
        bookingUrgency,
        yardSize: String(form.yardSize ?? "medium"),
        lawnServices: (form.lawnServices as PriceCalculationOptions["lawnServices"]) ?? {},
      };
    case "roadside":
      return {
        bookingUrgency,
        roadsideType: String(form.roadsideType ?? "flat_tire"),
      };
    case "evcharge": {
      const bat = Number(form.batteryPct ?? 15);
      const kwh = Math.max(5, Math.min(80, (1 - bat / 100) * 60));
      return { bookingUrgency, kwh };
    }
    case "pressure":
      return {
        bookingUrgency,
        sqFt: Number(form.sqFt ?? 800),
        pressureSurface: String(form.pressureSurface ?? "driveway"),
      };
    case "snow":
      return {
        bookingUrgency,
        snowProperty: String(form.snowProperty ?? "driveway"),
      };
    case "gutter":
      return {
        bookingUrgency,
        linearFt: Math.min(300, Math.max(40, Number(form.gutterStories ?? 1) * 50)),
        gutterStories: Number(form.gutterStories ?? 1),
        gutterGuards: form.gutterGuards === true,
      };
    case "protect":
      return {
        bookingUrgency,
        protectPlan: String(form.protectPlan ?? "basic"),
      };
    case "help":
      return {
        bookingUrgency,
        duration: Number(form.helpHours ?? 2),
        helpType: String(form.helpType ?? "loading"),
      };
    case "cuts":
      return {
        bookingUrgency,
        treeCount: String(form.treeCount ?? "1"),
        treeSize: String(form.treeSize ?? ""),
        stumpRemoval: form.stump === true,
        scheduleUrgency: urgency,
      };
    case "fence":
      return {
        bookingUrgency,
        linearFt: Number(form.fenceLength ?? 40),
        fenceMaterial: String(form.fenceMaterial ?? "wood"),
      };
    default:
      return { bookingUrgency };
  }
}
