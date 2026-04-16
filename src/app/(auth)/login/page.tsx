"use client";

export const dynamic = "force-dynamic";

import type React from "react";
import { useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { googleSignIn, logIn, resetPassword } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    setLoading(true);
    try {
      await logIn(email, password);
    } catch (err) {
      setLoading(false);
      const msg =
        err instanceof Error ? err.message : "Unable to sign in.";
      setError(msg);
    }
  }

  async function onForgot() {
    setError(null);
    setResetSent(false);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to send reset email.";
      setError(msg);
    }
  }

  async function onGoogle() {
    setError(null);
    setLoading(true);
    try {
      await googleSignIn();
    } catch (err) {
      setLoading(false);
      const msg =
        err instanceof Error ? err.message : "Google sign-in failed.";
      setError(msg);
    }
  }

  return (
    <>
      <BackButton href="/" />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 pb-10 pt-16 sm:pt-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-[var(--sub)]">
          Welcome back to GRIDD.
        </p>
      </div>

      <Card className="p-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-xs text-[var(--sub)]">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-[var(--sub)]">Password</label>
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
              className="underline underline-offset-4 text-[var(--sub)] hover:text-[var(--text)]"
              onClick={() => void onForgot()}
              disabled={!email}
            >
              Forgot password
            </button>
            <Link
              href="/signup"
              className="underline underline-offset-4 text-[var(--sub)] hover:text-[var(--text)]"
            >
              Create account
            </Link>
          </div>

          {resetSent ? (
            <div className="text-sm text-[var(--brand)]">
              Password reset email sent (if the address exists).
            </div>
          ) : null}

          {error ? <div className="text-sm text-[var(--accent)]">{error}</div> : null}

          <Button disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Sign In"}
          </Button>

          <div className="relative py-2">
            <div className="h-px bg-[var(--border)]" />
            <div className="absolute inset-x-0 -top-2 mx-auto w-fit bg-[var(--card)] px-2 text-xs text-[var(--sub)]">
              or
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={loading}
            onClick={() => void onGoogle()}
          >
            Continue with Google
          </Button>
        </form>
      </Card>
    </main>
    </>
  );
}

