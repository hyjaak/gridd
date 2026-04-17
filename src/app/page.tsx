import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingAuthRedirect } from "@/components/LandingAuthRedirect";
import { MarketingLanding } from "@/components/MarketingLanding";

function routeForRole(role: string) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "driver") return "/jobs";
  return "/home";
}

export default async function Home() {
  const jar = await cookies();
  const role = jar.get("gridd_role")?.value ?? jar.get("gridd-role")?.value;
  const agreementsOk =
    jar.get("gridd_agreements_ok")?.value === "1" ||
    jar.get("gridd-agreements-ok")?.value === "1";

  if (role) {
    if (!agreementsOk) redirect("/agreements");
    redirect(routeForRole(role));
  }

  return (
    <>
      <LandingAuthRedirect />
      <MarketingLanding />
    </>
  );
}
