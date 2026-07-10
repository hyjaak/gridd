/**
 * DoorDash restaurant discovery runs on the server (`doordashRestaurants.server.ts`) and is
 * exposed to the app via `GET /api/bites/nearby` and `GET /api/bites/menus/[businessId]`.
 * Re-export client-safe types.
 */
export type { BitesDoordashMenuItem, DoorDashLinkedBusiness } from "@/types/bitesDoordash";
