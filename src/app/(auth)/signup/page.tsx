"use client";

export const dynamic = "force-dynamic";

import type React from "react";
import { useMemo, useRef, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { UserRole } from "@/types";
import { signUp } from "@/lib/auth";

function strength(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score; // 0..4
}

const inputErrorBorder = "#ef4444";
const inputDefaultBorder = "#2a2a2a";

export default function SignupPage() {
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pwScore = useMemo(() => strength(password), [password]);
  const pwLabel = ["Too weak", "Weak", "Okay", "Strong", "Very strong"][pwScore] ?? "Too weak";

  const nameInvalid = !name.trim() || name.trim().split(/\s+/).filter(Boolean).length < 2;
  const emailInvalid =
    !email.trim() || !email.includes("@") || !email.includes(".");
  const phoneInvalid = !phone.trim() || phone.replace(/\D/g, "").length < 10;
  const passwordInvalid = !password || password.length < 8;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    setError("");

    if (!name.trim()) {
      setError("Please enter your full name.");
      nameRef.current?.focus();
      return;
    }

    if (name.trim().split(/\s+/).filter(Boolean).length < 2) {
      setError("Please enter your first AND last name.");
      nameRef.current?.focus();
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email address.");
      emailRef.current?.focus();
      return;
    }

    if (!email.includes("@") || !email.includes(".")) {
      setError("Please enter a valid email address.");
      emailRef.current?.focus();
      return;
    }

    if (!phone.trim()) {
      setError("Please enter your phone number.");
      phoneRef.current?.focus();
      return;
    }

    if (phone.replace(/\D/g, "").length < 10) {
      setError("Please enter a valid 10-digit phone number.");
      phoneRef.current?.focus();
      return;
    }

    if (!password) {
      setError("Please create a password.");
      passwordRef.current?.focus();
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      passwordRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, name, role, phone, undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create account.";
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <>
      <BackButton href="/login" />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 pb-10 pt-16 sm:pt-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Create your GRIDD account
          </h1>
          <p className="mt-1 text-sm text-[var(--sub)]">
            {role === "driver"
              ? "Next you’ll upload driver documents, then verify your email."
              : "You’ll verify your email, then complete required agreements."}
          </p>
        </div>

        <Card className="p-6">
          <form className="space-y-4" onSubmit={(e) => void handleSignup(e)}>
            {error ? (
              <div
                style={{
                  background: "#1a0000",
                  border: "1px solid #ef444444",
                  borderRadius: 10,
                  padding: "10px 14px",
                  color: "#ef4444",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <span aria-hidden>⚠️</span>
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-xs text-[var(--sub)]">Full name</label>
              <Input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
                style={{
                  border: `1px solid ${error && nameInvalid ? inputErrorBorder : inputDefaultBorder}`,
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[var(--sub)]">Email</label>
              <Input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                style={{
                  border: `1px solid ${error && emailInvalid ? inputErrorBorder : inputDefaultBorder}`,
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[var(--sub)]">Phone</label>
              <Input
                ref={phoneRef}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                autoComplete="tel"
                style={{
                  border: `1px solid ${error && phoneInvalid ? inputErrorBorder : inputDefaultBorder}`,
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[var(--sub)]">Password</label>
              <Input
                ref={passwordRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                style={{
                  border: `1px solid ${error && passwordInvalid ? inputErrorBorder : inputDefaultBorder}`,
                }}
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--sub)]">Strength</span>
                <span className={pwScore >= 3 ? "text-[var(--brand)]" : "text-[var(--accent)]"}>
                  {pwLabel}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--card)] ring-1 ring-[var(--border)]">
                <div
                  className={pwScore >= 3 ? "h-full bg-[var(--brand)]" : "h-full bg-[var(--accent)]"}
                  style={{ width: `${(pwScore / 4) * 100}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[var(--sub)]">Role</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={[
                    "rounded-xl border px-3 py-3 text-left",
                    role === "customer"
                      ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--card)_60%,black)]"
                      : "border-[var(--border)] bg-[var(--card)]",
                  ].join(" ")}
                  onClick={() => setRole("customer")}
                >
                  <div className="text-sm font-semibold text-[var(--text)]">Customer</div>
                  <div className="text-xs text-[var(--sub)]">🏠 Book services</div>
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-xl border px-3 py-3 text-left",
                    role === "driver"
                      ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--card)_60%,black)]"
                      : "border-[var(--border)] bg-[var(--card)]",
                  ].join(" ")}
                  onClick={() => setRole("driver")}
                >
                  <div className="text-sm font-semibold text-[var(--text)]">Driver</div>
                  <div className="text-xs text-[var(--sub)]">🚛 Earn with jobs</div>
                </button>
              </div>
            </div>

            <Button disabled={loading} className="w-full">
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </Card>
      </main>
    </>
  );
}
