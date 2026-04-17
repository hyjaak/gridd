"use client";

import Link from "next/link";
import { services } from "@/constants";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const SERVICE_STYLE: Record<string, { color: string }> = {
  haul: { color: "#FF6B00" },
  send: { color: "#3B82F6" },
  ride: { color: "#8B5CF6" },
  help: { color: "#F59E0B" },
  cuts: { color: "#22c55e" },
  lawn: { color: "#16a34a" },
  pressure: { color: "#06B6D4" },
  snow: { color: "#93C5FD" },
  gutter: { color: "#A78BFA" },
  fence: { color: "#D97706" },
  protect: { color: "#EC4899" },
};

export function MarketingLanding() {
  function scrollToHow() {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-[#030303] text-[var(--text)]">
      <header className="border-b border-white/10 bg-black/40 px-6 py-8 text-center backdrop-blur">
        <div className="mx-auto max-w-4xl">
          <div className="text-4xl font-bold tracking-tight text-[#00FF88] sm:text-5xl">GRIDD</div>
          <div className="mt-2 text-lg text-white/90">The Neighborhood Economy</div>
          <p className="mt-3 text-sm text-white/55">
            11 services. One app. Real ownership.
          </p>
        </div>
      </header>

      <section className="relative overflow-hidden px-6 py-16 sm:py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 20%, rgba(0,255,136,0.35), transparent 55%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Ditch anything.
          </h1>
          <p className="mt-4 text-3xl font-semibold text-white/90 sm:text-5xl">Book everything.</p>
          <p className="mt-4 text-2xl font-medium text-[#00FF88] sm:text-4xl">Own a piece of it.</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Button
              asChild
              href="/signup"
              className="min-h-[48px] min-w-[220px] px-8 text-base"
            >
              <span>Get Started — It&apos;s Free</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-[48px] min-w-[220px] border-[#00FF88]/40 px-8 text-base text-[#00FF88]"
              onClick={scrollToHow}
            >
              See How It Works
            </Button>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.03] px-6 py-10">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            { label: "11", sub: "Services" },
            { label: "85%", sub: "To drivers" },
            { label: "2%", sub: "Wallet interest" },
            { label: "Atlanta", sub: "GA" },
          ].map((s) => (
            <div key={s.sub} className="text-center">
              <div className="text-3xl font-bold text-[#00FF88]">{s.label}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-white/50">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-xl font-semibold text-white">Services preview</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-white/55">
            Every category your block needs — one coordinated network.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {services.map((s) => {
              const st = SERVICE_STYLE[s.id] ?? { color: "#00FF88" };
              return (
                <div
                  key={s.id}
                  className="group rounded-2xl border border-white/10 bg-[#0a0a0a] p-4 transition-transform hover:-translate-y-0.5 hover:border-[#00FF88]/40"
                >
                  <div
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: st.color }}
                  >
                    {s.name}
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs text-white/50">{s.description}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-semibold text-white">How it works</h2>
          <div className="mt-10 grid gap-6">
            <Card className="border-[#00FF88]/20 bg-[#0a0a0a] p-6">
              <div className="text-2xl">📍</div>
              <div className="mt-2 text-lg font-semibold text-white">Post your job</div>
              <p className="mt-1 text-sm text-white/55">Tell us what you need — haul, lawn, ride, and more.</p>
            </Card>
            <Card className="border-[#00FF88]/20 bg-[#0a0a0a] p-6">
              <div className="text-2xl">🚛</div>
              <div className="mt-2 text-lg font-semibold text-white">Get matched</div>
              <p className="mt-1 text-sm text-white/55">
                A verified local provider accepts — transparent pricing, no surprises.
              </p>
            </Card>
            <Card className="border-[#00FF88]/20 bg-[#0a0a0a] p-6">
              <div className="text-2xl">✅</div>
              <div className="mt-2 text-lg font-semibold text-white">Done &amp; paid</div>
              <p className="mt-1 text-sm text-white/55">
                Rate the experience and earn Ditch Points toward your next booking.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-gradient-to-b from-[#050505] to-black px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-semibold text-white">For drivers</h2>
          <p className="mt-3 text-3xl font-bold text-[#00FF88]">Turn your truck into a business</p>
          <p className="mt-4 text-sm text-white/60">
            Keep 85% · Earn equity · Build your tier
          </p>
          <div className="mt-8">
            <Button asChild href="/signup" className="min-h-[48px] px-10">
              <span>Become a Provider</span>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-xl font-semibold text-white">The Porch</h2>
          <p className="mt-2 text-center text-sm text-white/55">Your neighborhood has a voice</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Card className="border-white/10 bg-[#0a0a0a] p-5">
              <div className="text-xs text-[#00FF88]">Shoutout</div>
              <div className="mt-2 font-semibold text-white">Best haul this week</div>
              <p className="mt-2 text-sm text-white/55">
                “Driver was on time, careful with the stairs, and the price matched the estimate.”
              </p>
            </Card>
            <Card className="border-white/10 bg-[#0a0a0a] p-5">
              <div className="text-xs text-[#D4A574]">Debate</div>
              <div className="mt-2 font-semibold text-white">Snow routes for side streets?</div>
              <p className="mt-2 text-sm text-white/55">
                Neighbors are voting on priority zones after the last storm — join the thread in-app.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-10 text-center text-xs text-white/45">
        <p>© 2025 GRIDD Technologies, LLC</p>
        <p className="mt-1">Atlanta, Georgia</p>
        <p className="mt-1">
          <a href="https://gridd.click" className="text-[#00FF88] underline-offset-4 hover:underline">
            gridd.click
          </a>
        </p>
        <div className="mx-auto mt-8 flex max-w-md flex-col items-stretch justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/login"
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full border border-white bg-transparent px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-white/10"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-[#00FF88] px-6 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Get Started
          </Link>
        </div>
      </footer>
    </div>
  );
}
