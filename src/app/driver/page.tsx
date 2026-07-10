"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/hooks/useAuth";
import app from "@/lib/firebase";
import { getDriverAccess } from "@/lib/driver-gate";
import type { Provider } from "@/types";
import { config } from "@/constants";

const ACCENT = "#00FF88";

function DriverShell({ showDriverResumeHint }: { showDriverResumeHint: boolean }) {
  const [hours, setHours] = useState(30);
  const [hourly, setHourly] = useState(28);
  const weeklyGross = useMemo(() => Math.round(hours * hourly * 0.85), [hours, hourly]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030303] text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,255,136,0.12), transparent), #030303`,
        }}
      />
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="font-[family-name:var(--font-syne)] text-lg font-bold text-white">
            {config.appName}
          </Link>
          <div className="flex items-center gap-2">
            <Button type="button" asChild variant="secondary" className="border-white/20 bg-white/5 text-sm">
              <Link href="/?modal=login">Sign in</Link>
            </Button>
            <Button type="button" asChild className="text-sm">
              <Link href="/?modal=driverSignup">Apply to drive</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-16 px-5 py-12 sm:py-20">
        <section className="text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
            Drive with {config.appName}
          </p>
          <h1 className="font-[family-name:var(--font-syne)] text-3xl font-extrabold text-white sm:text-5xl">
            Your block. Your hustle.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
            High take-home, local matching, and a product built for serious providers — not a faceless algorithm.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button type="button" asChild className="min-h-12 min-w-[220px] rounded-full font-bold">
              <Link href="/?modal=driverSignup">Apply to drive</Link>
            </Button>
            <Button type="button" asChild variant="secondary" className="min-h-12 min-w-[220px] rounded-full">
              <Link href="/?modal=login">Already applied? Sign in</Link>
            </Button>
          </div>
        </section>

        {showDriverResumeHint ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-center text-sm text-amber-100">
            Complete onboarding or wait for review — you’ll land on{" "}
            <Link className="font-semibold text-[#00FF88] hover:underline" href="/driver/jobs">
              Jobs
            </Link>{" "}
            when approved.
          </p>
        ) : null}

        <section>
          <h2 className="font-[family-name:var(--font-syne)] text-2xl font-bold text-white">Requirements</h2>
          <ul className="mt-4 space-y-2 text-sm text-zinc-400">
            {[
              "Valid license + insurance (commercial auto for most vehicle work)",
              "Background-friendly profile — we review every application",
              "Smartphone with the GRIDD driver app to accept jobs in real time",
              "Willing to complete provider agreements in-app",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-[#00FF88]">✓</span> {t}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-syne)] text-2xl font-bold text-white">Earnings (illustrative)</h2>
          <p className="mt-1 text-sm text-zinc-500">Rough weekly take after an ~85% to-driver split (not a guarantee).</p>
          <Card className="mt-4 border-white/10 bg-zinc-950/60 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-zinc-500">Hours / week on platform</label>
                <Input
                  type="number"
                  min={0}
                  max={80}
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Gross $ / hour (before platform fee)</label>
                <Input
                  type="number"
                  min={0}
                  value={hourly}
                  onChange={(e) => setHourly(Number(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="mt-4 font-mono text-2xl font-bold text-[#00FF88]">~${weeklyGross} / wk to you (est.)</p>
            <p className="text-xs text-zinc-600">Tiers, services, and demand in your area change actuals.</p>
          </Card>
        </section>

        <section className="pb-8 text-center">
          <h2 className="font-[family-name:var(--font-syne)] text-xl font-bold text-white">Ready to apply?</h2>
          <p className="mt-2 text-sm text-zinc-500">Create your driver account — we’ll walk you through documents next.</p>
          <Button type="button" asChild className="mt-6 min-h-12 rounded-full px-8 font-bold">
            <Link href="/?modal=driverSignup">Start driver signup</Link>
          </Button>
        </section>
      </main>
    </div>
  );
}

/**
 * Public driver marketing + apply entry at `/driver`.
 * Approved or active demo drivers are sent to the job board.
 */
export default function DriverMarketingPage() {
  const router = useRouter();
  const { user, loading, role } = useAuth();
  const [driverCheckDone, setDriverCheckDone] = useState(false);

  useEffect(() => {
    if (!user) {
      setDriverCheckDone(false);
      return;
    }
    if (loading) return;
    if (role === "ceo") {
      router.replace("/admin/dashboard");
      return;
    }
    if (role === "customer") {
      router.replace("/home");
      return;
    }
    if (role === "driver") {
      (async () => {
        const fs = getFirestore(app);
        const snap = await getDoc(doc(fs, "providers", user.uid));
        if (!snap.exists()) {
          setDriverCheckDone(true);
          return;
        }
        const p = { uid: user.uid, ...snap.data() } as Provider;
        const a = getDriverAccess(p);
        if (a === "approved" || a === "demo") {
          router.replace("/driver/jobs");
          return;
        }
        setDriverCheckDone(true);
      })();
      return;
    }
    if (role) setDriverCheckDone(true);
  }, [user, role, loading, router]);

  if (!user) {
    return <DriverShell showDriverResumeHint={false} />;
  }

  if (loading || (role === "driver" && !driverCheckDone)) {
    return <LoadingScreen />;
  }

  if (role === "ceo" || role === "customer") {
    return <LoadingScreen />;
  }

  if (role === "driver" && driverCheckDone) {
    return <DriverShell showDriverResumeHint />;
  }

  return <DriverShell showDriverResumeHint={false} />;
}
