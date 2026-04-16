import { redirect } from "next/navigation";

/** @deprecated Use `/active` — single driver active-job screen. */
export default function DriverActiveLegacyRedirect() {
  redirect("/active");
}
