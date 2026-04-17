"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { sendVerificationEmailToCurrentUser } from "@/lib/auth";

function VerifyEmailInner() {
  const router = useRouter();
  const search = useSearchParams();
  const emailParam = search.get("email") ?? "";
  const [email, setEmail] = useState(emailParam);
  const [resendCooldown, setResendCooldown] = useState(0);
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
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown > 0]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
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
      setResendCooldown(60);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send email. Sign in and try again.");
    } finally {
      setLoading(false);
    }
  }, [resendCooldown, email]);

  return (
    <main
      className="mx-auto flex min-h-full max-w-lg flex-col items-center px-6 pb-16 pt-12 text-center"
      style={{ background: "#060606", color: "#eee" }}
    >
      <div
        style={{
          background: "#0a0a0a",
          border: "1px solid #1a1a1a",
          borderRadius: 16,
          padding: 24,
          textAlign: "center",
          maxWidth: 380,
          margin: "0 auto",
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 16 }} aria-hidden>
          📧
        </div>

        <h2
          style={{
            color: "#00FF88",
            fontSize: 22,
            fontWeight: 900,
            marginBottom: 8,
          }}
        >
          Check Your Email
        </h2>

        <p style={{ color: "#888", fontSize: 14, lineHeight: 1.7 }}>We sent a verification link to</p>
        <p
          style={{
            color: "#eee",
            fontWeight: 700,
            fontSize: 15,
            margin: "6px 0 16px",
          }}
        >
          {email || "your inbox"}
        </p>
        <p style={{ color: "#888", fontSize: 13, lineHeight: 1.7 }}>
          Click the link in that email to activate your GRIDD account.
        </p>

        <div
          style={{
            background: "#1a1000",
            border: "1px solid #FFB80033",
            borderRadius: 12,
            padding: "12px 16px",
            margin: "20px 0",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 20, flexShrink: 0 }} aria-hidden>
            ⚠️
          </span>
          <div>
            <div
              style={{
                color: "#FFB800",
                fontWeight: 700,
                fontSize: 13,
                marginBottom: 4,
              }}
            >
              Don&apos;t see it? Check your spam folder
            </div>
            <div style={{ color: "#888", fontSize: 12, lineHeight: 1.6 }}>
              Sometimes verification emails land in spam or junk. Look for an email from{" "}
              <span style={{ color: "#FFB800" }}>noreply@gridd.click</span> or{" "}
              <span style={{ color: "#FFB800" }}>noreply@firebaseapp.com</span> and mark it as &quot;Not Spam&quot;.
            </div>
          </div>
        </div>

        {sentMsg ? (
          <p style={{ color: "#00FF88", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Sent! Check your inbox.</p>
        ) : null}
        {err ? (
          <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>{err}</p>
        ) : null}

        {!hasUser ? (
          <p style={{ color: "#888", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
            Sign in with your email and password to resend the verification link.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={loading || resendCooldown > 0 || !hasUser}
          aria-busy={loading}
          style={{
            background: resendCooldown > 0 ? "#111" : "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: 12,
            padding: "12px 24px",
            color: resendCooldown > 0 ? "#555" : "#888",
            cursor: resendCooldown > 0 || !hasUser ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 600,
            width: "100%",
            marginBottom: 10,
          }}
        >
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "📤 Resend Verification Email"}
        </button>

        <button
          type="button"
          onClick={() => router.push("/login")}
          style={{
            background: "linear-gradient(135deg, #00FF88, #00CC66)",
            color: "#000",
            border: "none",
            borderRadius: 12,
            padding: "13px 24px",
            fontSize: 14,
            fontWeight: 900,
            cursor: "pointer",
            width: "100%",
          }}
        >
          ✅ I Verified — Sign In
        </button>
      </div>

      <Link href="/login" className="mt-8 text-sm font-medium text-[#00FF88] hover:underline">
        Back to sign in
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
