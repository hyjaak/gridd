"use client";

export const dynamic = "force-dynamic";

import type React from "react";
import { useMemo, useState } from "react";
import { AddressInput } from "@/components/AddressInput";
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

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceArea, setServiceArea] = useState("");

  const pwScore = useMemo(() => strength(password), [password]);
  const pwLabel = ["Too weak", "Weak", "Okay", "Strong", "Very strong"][pwScore] ?? "Too weak";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (role === "driver" && !serviceArea.trim()) {
      setError("Add your primary service area (city or full address).");
      return;
    }

    setLoading(true);
    try {
      await signUp(
        email,
        password,
        name,
        role,
        phone,
        role === "driver" ? serviceArea.trim() : undefined,
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create account.";
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
          Choose your role. You’ll complete required agreements next.
        </p>
      </div>

      <Card className="p-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-xs text-[var(--sub)]">Full name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required />
          </div>

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
            <label className="text-xs text-[var(--sub)]">Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-[var(--sub)]">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
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

          {role === "driver" ? (
            <div className="space-y-2">
              <label className="text-xs text-[var(--sub)]">Primary service area</label>
              <AddressInput
                value={serviceArea}
                onChange={setServiceArea}
                placeholder="Where you accept jobs (address or ZIP)"
              />
              <p className="text-xs text-[var(--sub)]">
                Used to match you with nearby work. You can refine this later.
              </p>
            </div>
          ) : null}

          {error ? <div className="text-sm text-[var(--accent)]">{error}</div> : null}

          <Button disabled={loading} className="w-full">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </Card>
    </main>
    </>
  );
}

