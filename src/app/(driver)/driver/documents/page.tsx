import { redirect } from "next/navigation";

/** Alias for CEO / demo “Go Live” — same flow as signup driver docs. */
export default function DriverDocumentsAliasPage() {
  redirect("/signup/driver-docs");
}
