/** CEO Firebase Auth UID — single source of truth for CEO-gated routes and rules */
export const CEO_UID = "51hByax004NTrTblndZ4uRUhKhU2";

/** Public-facing phone number for the GRIDD dispatch business */
export const PHONE = "(313) 825-9887";

/** Public-facing phone number as a clickable tel: link */
export const PHONE_HREF = "tel:3138259887";

/** SMS link */
export const SMS_HREF = "sms:+13138259887";

/** Owner phone for Twilio notifications (E.164) */
export const OWNER_PHONE = "+13138259887";

/** Owner name shown in trust strip */
export const OWNER_NAME = "Ibrahim";

/** Owner email */
export const EMAIL = "rawjitta@gmail.com";

/** Google review link (placeholder) — surfaces after a 4–5★ rating */
export const REVIEW_URL = "https://g.page/r/GRIDD/review";

/** GRIDD Dispatch services — single source of truth. jobType values match Firestore dispatchJobs schema. */
export type ServiceId = "delivery" | "errand" | "hauling";

export const SERVICES: { id: ServiceId; label: string; blurb: string; from: number; examples: string[] }[] = [
  { id: "delivery", label: "Delivery",      blurb: "Marketplace & store pickups", from: 45, examples: ["Marketplace pickup $45–60", "Store pickup $55–75"] },
  { id: "errand",   label: "Errands",       blurb: "Runs, drops, wait-in-line",   from: 45, examples: ["Document run $45", "Wait-in-line job $45–65"] },
  { id: "hauling",  label: "Light hauling", blurb: "One-van loads, gone today",   from: 75, examples: ["Loveseat / chair haul-away $75–95", "Curbside junk load $75–110"] },
];

export const MARKETS = {
  OH: { code: "DAY" as const, label: "Dayton OH", city: "Dayton", state: "Ohio", decal: "DAYTON",
        towns: ["Dayton","Trotwood","Kettering","Huber Heights","Beavercreek","Miamisburg","Fairborn"] },
  GA: { code: "ATL" as const, label: "Norcross GA", city: "Norcross", state: "Georgia", decal: "NORCROSS",
        towns: ["Norcross","Peachtree Corners","Duluth","Lilburn","Tucker","Doraville","Lawrenceville"] },
} as const;

export type MarketKey = keyof typeof MARKETS;

export const SERVICE_AREAS = MARKETS.OH.towns;

export const SERVICE_AREA_DEFAULT = "Dayton";