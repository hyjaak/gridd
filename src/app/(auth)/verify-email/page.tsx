"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { sendVerificationEmailToCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

function VerifyEmailInner() {
  const search = useSearchParams();
  const emailParam = search.get("email") ?? "";
  const [email, setEmail] = useState(emailParam);
  const [cooldown, setCooldown] = useState(0);
  const [sentMsg, setSentMsg] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasUser, setHasUser] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setHasUser(!!u);
      if (u?.email) setEmail(u.email);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const resend = useCallback(async () => {
    if (cooldown > 0) return;
    setErr(null);
    setLoading(true);
    try {
      await sendVerificationEmailToCurrentUser();
      try {
        await fetch("/api/email/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: auth.currentUser?.email ?? email,
            name: auth.currentUser?.displayName,
          }),
        });
      } catch {
        /* optional */
      }
      setSentMsg(true);
      setCooldown(60);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send email. Sign in and try again.");
    } finally {
      setLoading(false);
    }
  }, [cooldown, email]);

  return (
    <main
      className="mx-auto flex min-h-full max-w-lg flex-col items-center px-6 pb-16 pt-20 text-center"
      style={{ background: "#060606", color: "#eee" }}
    >
      <div className="text-6xl" aria-hidden>
        📧
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight" style={{ color: "#00FF88" }}>
        Check Your Email
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        We sent a verification link to{" "}
        <span className="font-medium text-zinc-200">{email || "your inbox"}</span>. Click the link in that email to
        activate your GRIDD account.
      </p>

      {sentMsg ? (
        <p className="mt-4 text-sm font-semibold text-[#00FF88]">Sent! Check your inbox.</p>
      ) : null}
      {err ? <p className="mt-4 text-sm text-red-400">{err}</p> : null}

      {!hasUser ? (
        <p className="mt-4 max-w-sm text-sm text-zinc-500">
          Sign in with your email and password to resend the verification link.
        </p>
      ) : null}

      <Button
        type="button"
        disabled={loading || cooldown > 0 || !hasUser}
        className="mt-8 w-full max-w-sm"
        onClick={() => void resend()}
      >
        {cooldown > 0 ? `Resend in ${cooldown}s` : "Didn't get it? Resend Email"}
      </Button>

      <Link href="/login" className="mt-6 text-sm font-medium text-[#00FF88] hover:underline">
        Already verified? Sign In
      </Link>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a
          href="https://mail.google.com/mail/u/0/#inbox"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-[#00FF88]"
        >
          Open Gmail
        </a>
        <a
          href={email ? `mailto:${encodeURIComponent(email)}` : "mailto:"}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-[#00FF88]"
        >
          Open mail app
        </a>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={<main className="min-h-screen bg-[#060606] px-6 py-24 text-center text-zinc-500">Loading…</main>}
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
