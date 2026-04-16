import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingAuthRedirect } from "@/components/LandingAuthRedirect";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 px-6 py-14">
      <div className="text-center">
        <div className="text-4xl font-semibold tracking-tight text-[var(--brand)]">
          GRIDD
        </div>
        <div className="mt-2 text-sm text-[var(--sub)]">
          The Neighborhood Economy
        </div>
      </div>

      <Card className="w-full max-w-md p-6">
        <div className="space-y-4">
          <div className="text-sm text-[var(--text)]">
            Book trusted help, get matched fast, and keep work local.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild href="/signup" className="w-full">
              <span>Get Started</span>
            </Button>
            <Button variant="secondary" asChild href="/login" className="w-full">
              <span>Sign In</span>
            </Button>
          </div>
          <div className="text-xs text-[var(--sub)]">
            By continuing you’ll be asked to review required legal documents.
          </div>
        </div>
      </Card>

      <div className="text-xs text-[var(--sub)]">
        <Link className="underline underline-offset-4" href="/agreements">
          View agreements
        </Link>
      </div>
    </main>
    </>
  );
}
