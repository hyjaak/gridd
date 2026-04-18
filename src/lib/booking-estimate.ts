import type { Urgency } from "@/types/booking";

const NOW_FEE_CENTS = 1500;

/** Base prices (cents) when not using external SERVICE_META */
const BASE_CENTS: Record<string, number> = {
  haul: 4500,
  send: 2200,
  ride: 1800,
  help: 3500,
  cuts: 6500,
  lawn: 4200,
  pressure: 4200,
  snow: 4500,
  gutter: 4200,
  fence: 8000,
  protect: 3500,
  roadside: 8500,
  evcharge: 7500,
};

export function urgencyFeeCents(urgency: Urgency): number {
  if (urgency === "now") return NOW_FEE_CENTS;
  return 0;
}

export type BookingForm = Record<string, unknown>;

/** Size / complexity multipliers on top of service base (cents) */
export function estimateCentsForService(
  serviceId: string,
  form: BookingForm,
  urgency: Urgency,
): number {
  const base = BASE_CENTS[serviceId] ?? 2800;
  let mult = 1;

  switch (serviceId) {
    case "haul": {
      const w = String(form.weight ?? "medium");
      const weightMap: Record<string, number> = {
        light: 1,
        medium: 1.15,
        heavy: 1.35,
        "extra-heavy": 1.55,
      };
      mult *= weightMap[w] ?? 1.15;
      const items = Math.min(20, Math.max(1, Number(form.itemsCount ?? 1)));
      mult *= 1 + (items - 1) * 0.04;
      if (form.stairs === true) mult *= 1.12;
      const floors = Number(form.stairsFloors ?? 0);
      if (floors > 0) mult *= 1 + Math.min(floors, 10) * 0.02;
      break;
    }
    case "lawn": {
      const y = String(form.yardSize ?? "medium");
      const yardMap: Record<string, number> = {
        small: 1,
        medium: 1.2,
        large: 1.45,
        xl: 1.7,
      };
      mult *= yardMap[y] ?? 1.2;
      const svc = (form.lawnServices as Record<string, boolean>) ?? {};
      let add = 0;
      if (svc.edge) add += 0.06;
      if (svc.blow) add += 0.05;
      if (svc.bags) add += 0.08;
      mult *= 1 + add;
      break;
    }
    case "cuts": {
      const trees = String(form.treeCount ?? "1");
      const treeMap: Record<string, number> = {
        "1": 1,
        "2": 1.35,
        "3": 1.65,
        "4": 1.9,
        "5+": 2.2,
      };
      mult *= treeMap[trees] ?? 1;
      const sz = String(form.treeSize ?? "medium");
      const sizeMap: Record<string, number> = {
        small: 1,
        medium: 1.15,
        large: 1.35,
        "very-large": 1.55,
      };
      mult *= sizeMap[sz] ?? 1.15;
      if (form.stump === true) mult *= 1.18;
      break;
    }
    case "ride": {
      const t = String(form.rideType ?? "standard");
      const rideMap: Record<string, number> = {
        standard: 1,
        xl: 1.2,
        cargo: 1.35,
      };
      mult *= rideMap[t] ?? 1;
      break;
    }
    case "pressure": {
      const sq = Number(form.sqFt ?? 500);
      mult *= 1 + Math.min(Math.max(sq, 100), 5000) / 5000;
      break;
    }
    case "send": {
      const size = String(form.sendSize ?? "medium");
      mult *= size === "xl" ? 1.4 : size === "large" ? 1.2 : size === "small" ? 0.95 : 1.05;
      break;
    }
    case "help": {
      const hours = Math.min(12, Math.max(1, Number(form.helpHours ?? 2)));
      mult *= 0.5 + hours * 0.35;
      break;
    }
    case "snow": {
      mult *= 1.08;
      break;
    }
    case "gutter": {
      const stories = Math.min(4, Math.max(1, Number(form.gutterStories ?? 1)));
      mult *= 1 + (stories - 1) * 0.12;
      if (form.gutterGuards === true) mult *= 1.15;
      break;
    }
    case "fence": {
      const length = Math.min(500, Math.max(5, Number(form.fenceLength ?? 40)));
      mult *= 1 + length / 200;
      break;
    }
    case "protect": {
      const plan = String(form.protectPlan ?? "basic");
      mult *= plan === "business" ? 1.6 : plan === "monthly" ? 1.35 : plan === "pro" ? 1.2 : 1;
      break;
    }
    default:
      mult *= 1.05;
  }

  const raw = base * mult + urgencyFeeCents(urgency);
  return Math.round(Math.max(raw, base * 0.5 + urgencyFeeCents(urgency)));
}
