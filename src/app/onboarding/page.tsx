"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getFirestore, updateDoc } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { getUserRole } from "@/lib/userRole";

const BG = "#060606";
const SUB = "#888";

const SERVICE_ICONS = ["🚛", "📦", "🚗", "💪", "🌳", "🌿", "💧", "❄️", "🏠", "🔧", "🛡️"];

function SlideWrap({
  children,
  visible,
}: {
  children: ReactNode;
  visible: boolean;
}) {
  return (
    <div
      className="flex min-h-[calc(100vh-120px)] flex-col items-center justify-center px-6 text-center"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.4s ease, transform 0.4s ease",
      }}
    >
      {children}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [role, setRole] = useState<"customer" | "driver" | "admin" | null>(null);
  const [slide, setSlide] = useState(0);
  const [saving, setSaving] = useState(false);

  const db = useMemo(() => (firebaseApp ? getFirestore(firebaseApp) : null), []);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void (async () => {
      const r = await getUserRole(user.uid);
      if (cancelled) return;
      if (r === "admin") {
        router.replace("/admin/dashboard");
        return;
      }
      setRole(r === "driver" ? "driver" : "customer");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  useEffect(() => {
    if (authLoading || !profile || !role) return;
    if (profile.onboardingComplete === true) {
      router.replace(role === "driver" ? "/jobs" : "/home");
    }
  }, [authLoading, profile, role, router]);

  const firstName = useMemo(() => {
    const n = profile?.name ?? user?.displayName ?? "";
    return n.trim().split(/\s+/)[0] || "there";
  }, [profile?.name, user?.displayName]);

  const completeAndGo = useCallback(
    async (dest: "/home" | "/jobs") => {
      if (!user || !db || !role || role === "admin") return;
      setSaving(true);
      try {
        const col = role === "driver" ? "providers" : "users";
        await updateDoc(doc(db, col, user.uid), { onboardingComplete: true });
        router.replace(dest);
      } finally {
        setSaving(false);
      }
    },
    [user, db, role, router],
  );

  const skip = useCallback(() => {
    void completeAndGo(role === "driver" ? "/jobs" : "/home");
  }, [completeAndGo, role]);

  const total = 4;
  const dots = Array.from({ length: total }, (_, i) => i);

  if (authLoading || !user || !role) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-500" style={{ background: BG }}>
        Loading…
      </main>
    );
  }

  if (profile?.onboardingComplete === true) {
    return null;
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-[#eee]" style={{ background: BG }}>
      <button
        type="button"
        onClick={() => void skip()}
        className="absolute right-4 top-4 z-20 text-sm font-semibold text-zinc-500 hover:text-zinc-300"
      >
        Skip
      </button>

      {role === "customer" ? (
        <>
          {slide === 0 ? (
            <SlideWrap visible>
              <div
                className="mb-8 text-5xl font-black tracking-tighter text-[#00FF88]"
                style={{ animation: "gridd-pulse-logo 2s ease-in-out infinite" }}
              >
                GRIDD
              </div>
              <h1 className="max-w-md text-2xl font-bold text-white">
                Welcome to GRIDD, {firstName} 👋
              </h1>
              <p className="mt-4 max-w-sm text-base" style={{ color: SUB }}>
                The neighborhood economy is now yours.
              </p>
              <button
                type="button"
                onClick={() => setSlide(1)}
                className="mt-10 rounded-2xl bg-[#00FF88] px-10 py-4 text-base font-black text-black"
              >
                Next →
              </button>
            </SlideWrap>
          ) : null}

          {slide === 1 ? (
            <SlideWrap visible>
              <p className="mb-6 text-lg font-bold text-white">11 services. One tap.</p>
              <div className="mb-8 flex max-w-sm flex-wrap justify-center gap-2">
                {SERVICE_ICONS.map((ic, i) => (
                  <span
                    key={ic}
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[#0a0a0a] text-2xl"
                    style={{
                      opacity: 0,
                      animation: `fadeSlide 0.35s ease ${i * 0.06}s forwards`,
                    }}
                  >
                    {ic}
                  </span>
                ))}
              </div>
              <p className="max-w-md text-sm leading-relaxed" style={{ color: SUB }}>
                From tree cutting to pressure washing to late night hauls — your neighborhood has everything you need.
              </p>
              <button
                type="button"
                onClick={() => setSlide(2)}
                className="mt-10 rounded-2xl bg-[#00FF88] px-10 py-4 text-base font-black text-black"
              >
                Next →
              </button>
            </SlideWrap>
          ) : null}

          {slide === 2 ? (
            <SlideWrap visible>
              <div
                className="mb-8 w-full max-w-xs rounded-2xl border border-[#FFB800]/40 bg-gradient-to-br from-[#1a1200] to-[#0a0a0a] p-6 text-left shadow-lg"
                style={{ animation: "fadeSlide 0.4s ease forwards" }}
              >
                <div className="text-xs font-bold uppercase tracking-widest text-[#FFB800]">Wallet</div>
                <div className="mt-2 font-mono text-2xl font-bold text-white">$0.00</div>
                <div className="mt-4 text-xs text-zinc-500">2% APY · Visa · Cashback</div>
              </div>
              <h2 className="text-xl font-bold text-white">Your money lives here.</h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed" style={{ color: SUB }}>
                GRIDD Wallet earns 2% interest. Your GRIDD Card works anywhere Visa does. Cashback on everything. No
                bank needed.
              </p>
              <button
                type="button"
                onClick={() => setSlide(3)}
                className="mt-10 rounded-2xl bg-[#00FF88] px-10 py-4 text-base font-black text-black"
              >
                Next →
              </button>
            </SlideWrap>
          ) : null}

          {slide === 3 ? (
            <SlideWrap visible>
              <p className="mb-2 text-sm font-bold uppercase tracking-widest text-[#00FF88]">
                Your neighborhood has a voice
              </p>
              <div className="mb-8 flex max-w-sm flex-col gap-3">
                {[
                  { t: "Best lawn guy on the block 🌿", s: "Jamie · 2h" },
                  { t: "Debate: Leaf blowers at 7am?", s: "Marcus · 1d" },
                ].map((row, i) => (
                  <div
                    key={row.t}
                    className="rounded-2xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-left"
                    style={{ opacity: 0, animation: `fadeSlide 0.4s ease ${i * 0.15}s forwards` }}
                  >
                    <div className="text-sm text-zinc-200">{row.t}</div>
                    <div className="mt-1 text-xs text-zinc-600">{row.s}</div>
                  </div>
                ))}
              </div>
              <h2 className="text-xl font-bold text-white">Your community talks here.</h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed" style={{ color: SUB }}>
                The Porch is where neighbors review providers, start debates, and shout out the best in the grid.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => void completeAndGo("/home")}
                className="mt-10 w-full max-w-sm rounded-2xl bg-[#00FF88] py-4 text-base font-black text-black disabled:opacity-50"
              >
                {saving ? "…" : "Enter GRIDD →"}
              </button>
            </SlideWrap>
          ) : null}
        </>
      ) : (
        <>
          {slide === 0 ? (
            <SlideWrap visible>
              <h1 className="max-w-md text-2xl font-bold text-white">
                Welcome to the grid, {firstName} 🚛
              </h1>
              <p className="mt-4 max-w-sm text-base" style={{ color: SUB }}>
                You&apos;re about to build something real.
              </p>
              <button
                type="button"
                onClick={() => setSlide(1)}
                className="mt-10 rounded-2xl bg-[#00FF88] px-10 py-4 text-base font-black text-black"
              >
                Next →
              </button>
            </SlideWrap>
          ) : null}

          {slide === 1 ? (
            <SlideWrap visible>
              <div className="mb-8 w-full max-w-xs rounded-2xl border border-white/10 bg-[#0a0a0a] p-5 text-left font-mono text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span>Job</span>
                  <span className="text-white">$200</span>
                </div>
                <div className="mt-2 flex justify-between text-[#00FF88]">
                  <span>You get (85%)</span>
                  <span>$170</span>
                </div>
                <div className="mt-2 flex justify-between text-zinc-500">
                  <span>GRIDD fee</span>
                  <span>handled</span>
                </div>
              </div>
              <p className="max-w-md text-sm leading-relaxed" style={{ color: SUB }}>
                Keep 85% of every job. Weekly payouts to your bank. Tier bonuses on top.
              </p>
              <button
                type="button"
                onClick={() => setSlide(2)}
                className="mt-10 rounded-2xl bg-[#00FF88] px-10 py-4 text-base font-black text-black"
              >
                Next →
              </button>
            </SlideWrap>
          ) : null}

          {slide === 2 ? (
            <SlideWrap visible>
              <div className="mb-8 space-y-3 text-left text-sm">
                <div className="rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3">
                  🥉 Bronze <span className="text-zinc-500">(0–49 jobs)</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3">
                  🥈 Silver <span className="text-zinc-500">(50–149)</span> →{" "}
                  <span className="text-[#00FF88]">+1% bonus</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3">
                  🥇 Gold <span className="text-zinc-500">(150–299)</span> →{" "}
                  <span className="text-[#00FF88]">+2% bonus</span>
                </div>
                <div className="rounded-xl border border-[#00FF88]/30 bg-[#00FF88]/10 px-4 py-3">
                  💎 Elite <span className="text-zinc-500">(300+)</span> →{" "}
                  <span className="text-[#00FF88]">+5% bonus + equity</span>
                </div>
              </div>
              <p className="max-w-md text-sm leading-relaxed" style={{ color: SUB }}>
                The more you work, the more you earn. Elite drivers own a piece of GRIDD.
              </p>
              <button
                type="button"
                onClick={() => setSlide(3)}
                className="mt-10 rounded-2xl bg-[#00FF88] px-10 py-4 text-base font-black text-black"
              >
                Next →
              </button>
            </SlideWrap>
          ) : null}

          {slide === 3 ? (
            <SlideWrap visible>
              <div
                className="mb-10 flex h-20 w-36 items-center justify-center rounded-2xl border-2 border-[#00FF88] bg-[#00FF88]/20 text-lg font-black text-[#00FF88]"
                style={{ animation: "gridd-online-pulse 2s ease-in-out infinite" }}
              >
                Online
              </div>
              <h2 className="text-xl font-bold text-white">When you&apos;re ready, go online.</h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed" style={{ color: SUB }}>
                Jobs come to you. Accept what you want. Decline what you don&apos;t. You&apos;re the boss.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => void completeAndGo("/jobs")}
                className="mt-10 w-full max-w-sm rounded-2xl bg-[#00FF88] py-4 text-base font-black text-black disabled:opacity-50"
              >
                {saving ? "…" : "Go Online Now →"}
              </button>
            </SlideWrap>
          ) : null}
        </>
      )}

      <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-2">
        {dots.map((i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: i === slide ? "#00FF88" : "#333",
            }}
          />
        ))}
      </div>
    </main>
  );
}
