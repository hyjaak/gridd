/**
 * Legacy path — forwards to the canonical handler.
 * Configure DoorDash to either URL:
 * - `https://gridd.click/api/bites/webhook` (preferred)
 * - `https://gridd.click/api/bites/doordash/webhook` (alias, same behavior)
 */
export { POST } from "../../webhook/route";
