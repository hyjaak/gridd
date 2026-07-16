"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { services, config } from "@/constants";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  completeGoogleSignUpAs,
  googleSignIn,
  GoogleNeedsRoleChoiceError,
  logIn,
  logOut,
  resetPassword,
  signUp,
} from "@/lib/auth";

const ACCENT = "#00FF88";
const ORANGE = "#FF6B00";

const SERVICE_COLOR = {
  haul: "#FF6B00",
  send: "#3B82F6",
  ride: "#8B5CF6",
  help: "#F59E0B",
  cuts: "#22c55e",
  lawn: "#16a34a",
  pressure: "#06B6D4",
  snow: "#93C5FD",
  gutter: "#A78BFA",
  fence: "#D97706",
  protect: "#EC4899",
  roadside: "#ef4444",
  evcharge: "#38BDF8",
};

function navLink(href, label) {
  return (
    <a
      href={href}
      className="text-sm font-medium text-zinc-400 transition hover:text-white"
    >
      {label}
    </a>
  );
}

/** Full-screen role picker after Google — must complete before entering GRIDD. */
function GoogleRoleFullscreen({ open, busy, error, onPickCustomer, onPickDriver, onUseDifferentAccount }) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-role-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0a",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        id="google-role-title"
        style={{
          fontFamily: "var(--font-bebas-neue), Impact, sans-serif",
          fontSize: 36,
          color: "#3dff7a",
          marginBottom: 8,
          letterSpacing: "0.06em",
          textAlign: "center",
        }}
      >
        WELCOME TO GRIDD
      </div>

      <div
        style={{
          fontSize: 14,
          color: "#555",
          marginBottom: 40,
          textAlign: "center",
        }}
      >
        How do you want to use GRIDD?
      </div>

      {error ? (
        <div className="mb-4 max-w-md text-center text-sm text-red-400" role="alert">
          {error}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          width: "100%",
          maxWidth: 400,
        }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => void onPickCustomer()}
          style={{
            background: "#111",
            border: "2px solid #1e1e1e",
            borderRadius: 20,
            padding: "28px 20px",
            textAlign: "center",
            cursor: busy ? "wait" : "pointer",
            transition: "all 0.2s",
            opacity: busy ? 0.65 : 1,
          }}
        >
          <div style={{ fontSize: 40 }} aria-hidden>
            🛍️
          </div>
          <div
            style={{
              fontFamily: "var(--font-syne), Syne, sans-serif",
              fontWeight: 700,
              fontSize: 16,
              color: "#fff",
              marginTop: 12,
              marginBottom: 6,
            }}
          >
            Customer
          </div>
          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.4 }}>Book rides, food and home services</div>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void onPickDriver()}
          style={{
            background: "#1a0d00",
            border: "2px solid #ff6b00",
            borderRadius: 20,
            padding: "28px 20px",
            textAlign: "center",
            cursor: busy ? "wait" : "pointer",
            transition: "all 0.2s",
            opacity: busy ? 0.65 : 1,
          }}
        >
          <div style={{ fontSize: 40 }} aria-hidden>
            🚛
          </div>
          <div
            style={{
              fontFamily: "var(--font-syne), Syne, sans-serif",
              fontWeight: 700,
              fontSize: 16,
              color: "#ff6b00",
              marginTop: 12,
              marginBottom: 6,
            }}
          >
            Provider
          </div>
          <div style={{ fontSize: 12, color: "#664400", lineHeight: 1.4 }}>Earn money on your schedule</div>
        </button>
      </div>

      <button
        type="button"
        disabled={busy}
        className="mt-10 text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
        onClick={() => void onUseDifferentAccount()}
      >
        Use a different Google account
      </button>
    </div>
  );
}

function LandingLoginModal({ open, onClose, onOpenSignup, onGoogleNeedsRole, nextUrl }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  useEffect(() => {
    if (!open) {
      setError(null);
      setResetSent(false);
    }
  }, [open]);

  if (!open) return null;

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    setLoading(true);
    try {
      await logIn(email, password);
      if (nextUrl) {
        window.location.href = nextUrl;
      }
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Unable to sign in.");
      if (email.trim()) {
        void fetch("/api/security/failed-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        }).catch(() => null);
      }
    }
  }

  async function onForgot() {
    setError(null);
    setResetSent(false);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email.");
    }
  }

  async function onGoogle() {
    setError(null);
    setLoading(true);
    try {
      await googleSignIn();
      if (nextUrl) {
        window.location.href = nextUrl;
      }
    } catch (err) {
      setLoading(false);
      if (err instanceof GoogleNeedsRoleChoiceError) {
        onClose?.();
        onGoogleNeedsRole?.();
        return;
      }
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0c0c] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="landing-login-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="landing-login-title" className="font-[family-name:var(--font-syne)] text-xl font-bold text-white">
              Sign in
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">{`Welcome back to ${config.appName}.`}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-lg leading-none text-zinc-500 hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <>
            <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  className="text-zinc-500 underline-offset-4 hover:text-white hover:underline"
                  onClick={() => void onForgot()}
                  disabled={!email}
                >
                  Forgot password
                </button>
                <button
                  type="button"
                  className="text-zinc-500 underline-offset-4 hover:text-[#00FF88] hover:underline"
                  onClick={onOpenSignup}
                >
                  Create account
                </button>
              </div>
              {resetSent ? (
                <div className="text-sm text-[#00FF88]">Password reset email sent (if the address exists).</div>
              ) : null}
              {error ? <div className="text-sm text-red-400">{error}</div> : null}
              <Button disabled={loading} className="h-12 w-full font-bold">
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="relative py-3 text-center text-xs text-zinc-600">
              <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-800" />
              <span className="relative bg-[#0c0c0c] px-2">or</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="h-12 w-full border border-white/15 bg-zinc-900/80"
              disabled={loading}
              onClick={() => void onGoogle()}
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <InlineSpinner />
                  Connecting to Google…
                </span>
              ) : (
                "Continue with Google"
              )}
            </Button>
        </>
      </div>
    </div>
  );
}

function InlineSpinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        display: "inline-block",
        animation: "gridd-spin 0.7s linear infinite",
      }}
    />
  );
}

function LandingSignupModal({ open, onClose, onOpenLogin, signupAs, onGoogleNeedsRole, nextUrl }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const title = signupAs === "driver" ? "Apply to drive" : "Create your account";
  const subtitle =
    signupAs === "driver"
      ? "Start the driver application — you'll add documents in the next step."
      : "Book jobs, Porch, and PriceIQ™ in one place.";

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      setError("Enter your full name (first and last).");
      return;
    }
    setLoading(true);
    try {
      const role = signupAs === "driver" ? "driver" : "customer";
      await signUp(email.trim(), password, name.trim(), role);
      if (nextUrl) {
        window.location.href = nextUrl;
      }
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Sign up failed.");
    }
  }

  async function onGoogle() {
    setError(null);
    setLoading(true);
    try {
      await googleSignIn();
      if (nextUrl) {
        window.location.href = nextUrl;
      }
    } catch (err) {
      setLoading(false);
      if (err instanceof GoogleNeedsRoleChoiceError) {
        onClose?.();
        onGoogleNeedsRole?.();
        return;
      }
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="my-6 w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0c0c] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="landing-signup-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="landing-signup-title" className="font-[family-name:var(--font-syne)] text-xl font-bold text-white">
              {title}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-lg leading-none text-zinc-500 hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">Full name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Taylor" required />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">Confirm password</label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
            />
          </div>
          {error ? <div className="text-sm text-red-400">{error}</div> : null}
          <Button disabled={loading} className="h-12 w-full font-bold">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="mt-2 text-center text-xs text-zinc-600">
          Already have an account?{" "}
          <button
            type="button"
            className="font-medium text-[#00FF88] hover:underline"
            onClick={onOpenLogin}
          >
            Sign in
          </button>
        </p>
        <div className="relative py-3 text-center text-xs text-zinc-600">
          <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-800" />
          <span className="relative bg-[#0c0c0c] px-2">or</span>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-12 w-full border border-white/15 bg-zinc-900/80"
          disabled={loading}
          onClick={() => void onGoogle()}
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <InlineSpinner />
              Connecting to Google…
            </span>
          ) : (
            "Continue with Google"
          )}
        </Button>
      </div>
    </div>
  );
}

/** GRIDD public marketing lander — used by `src/app/page.tsx` for signed-out users only. */
export function GriddLandingPage() {
  const [authModal, setAuthModal] = useState(null);
  const [signupAs, setSignupAs] = useState("customer");
  const [googleRoleOpen, setGoogleRoleOpen] = useState(false);
  const [googleRoleBusy, setGoogleRoleBusy] = useState(false);
  const [googleRoleError, setGoogleRoleError] = useState(null);

  const openGoogleRolePicker = useCallback(() => {
    setAuthModal(null);
    setGoogleRoleError(null);
    setGoogleRoleOpen(true);
  }, []);

  const handleGoogleRoleSelect = useCallback(async (role) => {
    setGoogleRoleBusy(true);
    setGoogleRoleError(null);
    try {
      await completeGoogleSignUpAs(role);
    } catch (err) {
      setGoogleRoleBusy(false);
      setGoogleRoleError(err instanceof Error ? err.message : "Could not finish sign-up.");
    }
  }, []);

  const handleGoogleUseDifferentAccount = useCallback(async () => {
    setGoogleRoleBusy(true);
    try {
      await logOut();
    } finally {
      setGoogleRoleBusy(false);
      setGoogleRoleOpen(false);
      setGoogleRoleError(null);
    }
  }, []);

  const openLogin = useCallback(() => {
    setAuthModal("login");
  }, []);
  const openSignup = useCallback((as) => {
    setSignupAs(as === "driver" ? "driver" : "customer");
    setAuthModal("signup");
  }, []);
  const closeModals = useCallback(() => setAuthModal(null), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const m = p.get("modal");
    if (m === "login") setAuthModal("login");
    else if (m === "signup") {
      setSignupAs("customer");
      setAuthModal("signup");
    } else if (m === "driverSignup") {
      setSignupAs("driver");
      setAuthModal("signup");
    }
    if (m) {
      const url = new URL(window.location.href);
      url.searchParams.delete("modal");
      window.history.replaceState({}, "", url.pathname + url.hash);
    }
  }, []);

  const [nextUrl, setNextUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const next = p.get("next");
    if (next) {
      setNextUrl(next);
    }
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030303] text-zinc-100">
      <GoogleRoleFullscreen
        open={googleRoleOpen}
        busy={googleRoleBusy}
        error={googleRoleError}
        onPickCustomer={() => void handleGoogleRoleSelect("customer")}
        onPickDriver={() => void handleGoogleRoleSelect("driver")}
        onUseDifferentAccount={() => void handleGoogleUseDifferentAccount()}
      />
      <LandingLoginModal
        open={authModal === "login"}
        onClose={closeModals}
        onGoogleNeedsRole={openGoogleRolePicker}
        onOpenSignup={() => {
          setAuthModal("signup");
          setSignupAs("customer");
        }}
        nextUrl={nextUrl}
      />
      <LandingSignupModal
        open={authModal === "signup"}
        onClose={closeModals}
        onGoogleNeedsRole={openGoogleRolePicker}
        onOpenLogin={() => {
          setAuthModal("login");
        }}
        signupAs={signupAs}
        nextUrl={nextUrl}
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 100% 80% at 50% -20%, rgba(0, 255, 136, 0.2), transparent 50%),
            radial-gradient(ellipse 60% 50% at 100% 50%, rgba(255, 107, 0, 0.08), transparent 45%),
            radial-gradient(ellipse 50% 40% at 0% 80%, rgba(139, 92, 246, 0.1), transparent 45%),
            #030303
          `,
        }}
      />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <a href="#hero" className="font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight text-white">
            {config.appName}
          </a>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Page sections">
            {navLink("#about", "What is GRIDD")}
            {navLink("#services", "Services")}
            {navLink("#priceiq", "PriceIQ™")}
            {navLink("#porch", "Porch")}
            {navLink("#drivers", "Drivers")}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openLogin}
              className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:text-white"
            >
              Sign in
            </button>
            <Button type="button" onClick={() => openSignup("customer")} className="!min-h-10 !px-5 text-sm">
              <span>Get started</span>
            </Button>
          </div>
        </div>
      </header>

      <section id="hero" className="scroll-mt-20 px-5 pb-20 pt-16 sm:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <p
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400"
            style={{ fontFamily: "var(--font-dm-sans), ui-sans-serif" }}
          >
            Better than ever · World class
          </p>
          <h1 className="font-[family-name:var(--font-syne)] text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl sm:leading-tight">
            The neighborhood
            <br />
            <span className="bg-gradient-to-r from-[#00FF88] to-[#4ade80] bg-clip-text text-transparent">
              economy, on demand
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
            One app for rides, home services, logistics, and rescue — with transparent{" "}
            <span className="text-zinc-200">PriceIQ™</span> pricing and neighbors you can actually trust.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Button
              type="button"
              onClick={() => openSignup("customer")}
              className="min-h-[52px] min-w-[200px] rounded-full text-base font-bold shadow-lg shadow-[#00FF88]/20"
            >
              <span>⚡ Get started free</span>
            </Button>
            <Button
              type="button"
              onClick={openLogin}
              variant="secondary"
              className="min-h-[52px] min-w-[200px] rounded-full border border-white/20 bg-white/5 text-base font-semibold text-white hover:bg-white/10"
            >
              <span>Sign in →</span>
            </Button>
          </div>
          <p className="mt-8 text-sm text-zinc-500">
            Already have an account?{" "}
            <button
              type="button"
              onClick={openLogin}
              className="font-medium text-[#00FF88] hover:underline"
            >
              Sign in
            </button>
          </p>
        </div>
        <div
          className="mx-auto mt-20 max-w-5xl rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/50 to-black/50 p-1"
          style={{ boxShadow: "0 0 80px rgba(0,255,136,0.12)" }}
        >
          <div
            className="rounded-xl bg-[#0a0a0a] p-6 sm:p-10"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
              backgroundSize: "32px 32px",
            }}
          >
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-zinc-500 sm:justify-between">
              <span className="font-mono text-xs text-zinc-600">LIVE</span>
              <span className="text-[#00FF88]">PriceIQ™ · at least $1.84 off Uber on rides</span>
              <span className="font-mono text-xs text-zinc-600">ZIP · JOB · MATCH</span>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="scroll-mt-20 border-t border-white/5 px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-[family-name:var(--font-syne)] text-center text-3xl font-bold text-white sm:text-4xl">
            What is {config.appName}?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-400">
            {config.tagline} — we connect you with vetted local providers for everything your block needs, with fair
            pricing and real accountability.
          </p>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                title: "One coordinated network",
                body: "Rides, haul, lawn, roadside, EV, and more — scheduled or same-day, without juggling five apps.",
                icon: "🧩",
              },
              {
                title: "Transparent PriceIQ™",
                body: "We benchmark the market (including live rideshare when available) so you know the deal before you book.",
                icon: "📊",
              },
              {
                title: "Built for the block",
                body: "The Porch keeps your neighborhood in the loop — shoutouts, votes, and local news that actually matters.",
                icon: "🏘️",
              },
            ].map((c) => (
              <Card
                key={c.title}
                className="border-white/10 bg-zinc-950/50 p-6 transition hover:border-[#00FF88]/30 hover:shadow-lg hover:shadow-[#00FF88]/5"
              >
                <div className="text-3xl" aria-hidden>
                  {c.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{c.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="scroll-mt-20 border-t border-white/5 bg-black/30 px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-[family-name:var(--font-syne)] text-center text-3xl font-bold text-white sm:text-4xl">
            Services
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-400">
            Every category your neighborhood needs — one wallet, one network, {services.length} ways to get it done.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {services.map((s) => {
              const col = SERVICE_COLOR[s.id] ?? ACCENT;
              return (
                <div
                  key={s.id}
                  className="group rounded-2xl border border-white/10 bg-[#0a0a0a] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-white/20"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: col }}>
                      {s.category}
                    </span>
                    <span className="text-zinc-600 transition group-hover:text-zinc-500">→</span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-white">{s.name}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{s.description}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-10 text-center">
            <Button type="button" onClick={openLogin} className="rounded-full px-8">
              <span>Sign in to explore & book</span>
            </Button>
          </p>
        </div>
      </section>

      <section id="priceiq" className="scroll-mt-20 px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-[family-name:var(--font-syne)] text-center text-3xl font-bold text-white sm:text-4xl">
            PriceIQ™ comparison
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-400">
            On rides, we pull live market estimates and guarantee meaningful savings. On other services, we refresh
            market benchmarks and beat them by design.
          </p>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Rides (live)</p>
              <h3 className="mt-2 text-2xl font-bold text-zinc-200">Competitor estimate</h3>
              <p className="mt-4 text-sm leading-relaxed text-zinc-500">
                When available, we read real-time rideshare price ranges for your route. Surge shows up in the market
                data — {config.appName} still aims to undercut with PriceIQ™.
              </p>
              <p className="mt-6 font-mono text-3xl text-zinc-400 line-through decoration-zinc-600">$24–32</p>
              <p className="text-xs text-zinc-600">example range · not a quote</p>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl border-2 p-8"
              style={{ borderColor: ACCENT, background: "linear-gradient(145deg, rgba(0,255,136,0.1), #0a0a0a)" }}
            >
              <div
                className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-30 blur-2xl"
                style={{ background: ACCENT }}
              />
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: ACCENT }}>
                PriceIQ™ on {config.appName}
              </p>
              <h3 className="mt-2 text-2xl font-bold text-white">You pay less, period</h3>
              <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                <li>
                  <span className="text-[#00FF88]">✓</span> At least <strong className="text-white">$1.84</strong> off
                  the reference fare on many rides, or <strong className="text-white">3.2%</strong> on higher fares
                  (whichever saves you more)
                </li>
                <li>
                  <span className="text-[#00FF88]">✓</span> Non-ride services: <strong className="text-white">3.2%</strong>{" "}
                  below the market reference we track
                </li>
                <li>
                  <span className="text-[#00FF88]">✓</span> Clear breakdown before you confirm — no surprise “gotchas”
                </li>
              </ul>
              <p className="mt-6 font-mono text-4xl font-bold" style={{ color: ACCENT }}>
                ~$20–28
              </p>
              <p className="text-xs text-zinc-500">illustrative · actual PriceIQ™ from your route</p>
            </div>
          </div>
        </div>
      </section>

      <section id="porch" className="scroll-mt-20 border-t border-white/5 bg-gradient-to-b from-[#0a0a0a] to-black px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-[family-name:var(--font-syne)] text-center text-3xl font-bold text-white sm:text-4xl">
            The Porch
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-400">
            Your neighborhood has a feed — not noise from the whole internet. Shoutouts, debates, and local context that
            help you book smarter.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {[
              {
                kicker: "Shoutout",
                title: "Real providers, real results",
                copy: "Recommend the crew that cleared your lot in the rain or the driver that showed up early. Good work travels fast.",
                edge: "from-[#00FF88]/20 to-transparent",
              },
              {
                kicker: "Debate",
                title: "Decide the block, together",
                copy: "Snow routes, event parking, new services — vote and comment with people who share your ZIP, not a random subreddit.",
                edge: "from-[#D4A574]/20 to-transparent",
              },
            ].map((b) => (
              <div
                key={b.title}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60 p-8"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${b.edge} pointer-events-none opacity-40`} />
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: ORANGE }}>
                  {b.kicker}
                </p>
                <h3 className="relative mt-2 text-xl font-bold text-white">{b.title}</h3>
                <p className="relative mt-3 text-sm leading-relaxed text-zinc-500">{b.copy}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center">
            <Button
              type="button"
              onClick={openLogin}
              variant="secondary"
              className="rounded-full border border-white/15"
            >
              <span>Sign in to open The Porch</span>
            </Button>
          </p>
        </div>
      </section>

      <section id="drivers" className="scroll-mt-20 px-5 py-20">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="font-[family-name:var(--font-syne)] text-3xl font-bold text-white sm:text-4xl">
            For drivers
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
            Turn your vehicle, time, and skills into income — with high take-home, no corporate middleman, and a product
            built to help you grow.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
            {[
              { n: "85%", d: "Keep the lion’s share of every completed job" },
              { n: "Tiers", d: "Progress from Starter to Gold with performance that shows" },
              { n: "Local", d: "Get matched to jobs in the ZIPs and services you choose" },
            ].map((x) => (
              <div key={x.n} className="rounded-2xl border border-white/10 bg-zinc-950/50 p-6">
                <p className="text-3xl font-bold text-[#00FF88]">{x.n}</p>
                <p className="mt-2 text-sm text-zinc-500">{x.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <Button type="button" onClick={() => openSignup("driver")} className="rounded-full px-10">
              <span>Start earning</span>
            </Button>
            <p className="mt-3 text-sm text-zinc-600">Commercial auto coverage required for most vehicle work · see onboarding</p>
          </div>
        </div>
      </section>

      <section id="stats" className="scroll-mt-20 border-t border-white/5 bg-zinc-950/40 px-5 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              { v: String(services.length), l: "Services" },
              { v: "85%", l: "To drivers" },
              { v: "3.2%", l: "Beat on market (non-ride)" },
              { v: "$1.84+", l: "Min ride savings" },
            ].map((s) => (
              <div key={s.l} className="text-center">
                <div
                  className="font-[family-name:var(--font-syne)] text-3xl font-extrabold sm:text-4xl"
                  style={{ color: ACCENT }}
                >
                  {s.v}
                </div>
                <div className="mt-1 text-xs font-medium uppercase tracking-widest text-zinc-500">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="get-started" className="scroll-mt-20 px-5 py-20">
        <div
          className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-[#00FF88]/30 p-1"
          style={{
            background: "linear-gradient(135deg, rgba(0,255,136,0.2), rgba(255,107,0,0.1))",
          }}
        >
          <div className="rounded-[22px] bg-[#080808] px-6 py-14 text-center sm:px-12">
            <h2 className="font-[family-name:var(--font-syne)] text-2xl font-bold text-white sm:text-3xl">
              Get {config.appName} — on the web today
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-zinc-400">
              Create your account, book your first job, and see PriceIQ™ in action. It takes minutes, not days.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={() => openSignup("customer")}
                className="min-h-12 w-full min-w-[200px] rounded-full sm:w-auto"
              >
                <span>Create free account</span>
              </Button>
              <Button
                type="button"
                onClick={openLogin}
                variant="secondary"
                className="min-h-12 w-full min-w-[200px] rounded-full border-white/20 bg-white/5 sm:w-auto"
              >
                <span>Sign in</span>
              </Button>
            </div>
            <p className="mt-6 text-sm text-zinc-600">Web app is live · gridd.click</p>
          </div>
        </div>
      </section>

      <footer id="footer" className="border-t border-white/10 bg-black px-5 py-14">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between">
            <div>
              <p className="font-[family-name:var(--font-syne)] text-2xl font-bold text-white">{config.appName}</p>
              <p className="mt-2 text-sm text-zinc-500">{config.tagline}</p>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Product</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <button
                      type="button"
                      onClick={openLogin}
                      className="text-zinc-400 hover:text-white"
                    >
                      Book a job
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={openLogin}
                      className="text-zinc-400 hover:text-white"
                    >
                      The Porch
                    </button>
                  </li>
                  <li>
                    <Link href="/how-it-works" className="text-zinc-400 hover:text-white">
                      How it works
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Company</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link href="/trust" className="text-zinc-400 hover:text-white">
                      Trust
                    </Link>
                  </li>
                  <li>
                    <Link href="/terms" className="text-zinc-400 hover:text-white">
                      Terms
                    </Link>
                  </li>
                  <li>
                    <a href="mailto:support@gridd.click" className="text-zinc-400 hover:text-white">
                      support@gridd.click
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Access</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <button type="button" onClick={openLogin} className="text-zinc-400 hover:text-white">
                      Sign in
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => openSignup("customer")}
                      className="text-zinc-400 hover:text-white"
                    >
                      Sign up
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <p className="mt-12 border-t border-white/5 pt-8 text-center text-xs text-zinc-600">
            © {new Date().getFullYear()} GRIDD Technologies, LLC · Atlanta, Georgia
          </p>
        </div>
      </footer>
    </div>
  );
}
