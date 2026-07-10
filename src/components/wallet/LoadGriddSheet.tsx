"use client";

import { useCallback, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { firebaseAuth } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

/** Presets in cents */
const PRESETS_CENTS = [1000, 2500, 5000, 10000] as const;

function money(dollars: number) {
  return dollars.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function WalletPaymentStep({
  amountCents,
  returnPath,
  onSuccess,
  onError,
}: {
  amountCents: number;
  returnPath: string;
  onSuccess: (paidCents: number) => void;
  onError: (msg: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    onError(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${typeof window !== "undefined" ? window.location.origin : ""}${returnPath}`,
      },
      redirect: "if_required",
    });
    setBusy(false);
    if (error) {
      onError(error.message ?? "Payment didn’t go through.");
      return;
    }
    onSuccess(amountCents);
  }, [stripe, elements, returnPath, onSuccess, onError, amountCents]);

  return (
    <div className="space-y-4">
      <p className="text-center text-xs text-[var(--sub)]">
        💳 Card · 🍎 Apple Pay · 🤖 Google Pay · 🏦 US bank — shown when available (Stripe)
      </p>
      <PaymentElement
        options={{
          layout: "accordion",
          defaultValues: { billingDetails: { email: firebaseAuth?.currentUser?.email ?? undefined } },
        }}
      />
      <Button
        type="button"
        className="w-full min-h-[52px] text-base font-bold"
        disabled={busy || !stripe}
        onClick={() => void handleConfirm()}
        style={{
          fontFamily: "var(--font-syne), ui-sans-serif, sans-serif",
          background: "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)",
          color: "#fff",
          boxShadow: "0 8px 24px rgba(255, 107, 0, 0.35)",
        }}
      >
        {busy ? "Processing…" : `Load GRIDD ⚡ ${money(amountCents / 100)}`}
      </Button>
    </div>
  );
}

export type LoadGriddSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Path only, e.g. `/wallet` or `/driver/wallet` — used for Stripe return_url */
  returnPath: string;
  walletUnlocked: boolean;
};

export function LoadGriddSheet({ open, onClose, returnPath, walletUnlocked }: LoadGriddSheetProps) {
  const [selectedCents, setSelectedCents] = useState<number | null>(null);
  const [customDollars, setCustomDollars] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCents, setSuccessCents] = useState<number | null>(null);

  const amountCents = useMemo(() => {
    if (selectedCents !== null) return selectedCents;
    const n = parseFloat(customDollars.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }, [selectedCents, customDollars]);

  const reset = useCallback(() => {
    setSelectedCents(null);
    setCustomDollars("");
    setClientSecret(null);
    setError(null);
    setLoadingIntent(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const startPayment = useCallback(async () => {
    if (!walletUnlocked || !amountCents || amountCents < 100 || amountCents > 500_000) {
      setError("Choose an amount between $1 and $5,000.");
      return;
    }
    setLoadingIntent(true);
    setError(null);
    const token = await firebaseAuth?.currentUser?.getIdToken().catch(() => null);
    const uid = firebaseAuth?.currentUser?.uid;
    if (!token || !uid) {
      setError("Sign in required.");
      setLoadingIntent(false);
      return;
    }
    const res = await fetch("/api/create-payment-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId: uid,
        amount: amountCents,
        currency: "usd",
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      clientSecret?: string;
      error?: string;
    };
    setLoadingIntent(false);
    if (!res.ok || !data?.ok || !data.clientSecret) {
      setError(data?.error ?? "Could not start payment.");
      return;
    }
    setClientSecret(data.clientSecret);
  }, [walletUnlocked, amountCents]);

  const onPaySuccess = useCallback(
    (paidCents: number) => {
      setSuccessCents(paidCents);
      window.setTimeout(() => {
        setSuccessCents(null);
        reset();
        onClose();
      }, 2400);
    },
    [onClose, reset],
  );

  if (!open) return null;

  if (!stripePromise) {
    return (
      <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 sm:items-center">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0a0a0a] p-6 sm:rounded-2xl">
          <p className="text-sm text-[var(--sub)]">Stripe is not configured (missing publishable key).</p>
          <Button variant="secondary" className="mt-4" type="button" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 sm:items-center">
      <div
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl sm:rounded-2xl sm:pb-8"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        {successCents !== null ? (
          <div
            role="status"
            className="absolute inset-0 z-[50] flex items-center justify-center rounded-[inherit] bg-black/75 px-6"
          >
            <p className="text-center text-lg font-bold text-[#00FF88]" style={{ fontFamily: "var(--font-syne), sans-serif" }}>
              ⚡ {money(successCents / 100)} added to GRIDD!
            </p>
          </div>
        ) : null}
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--text)]" style={{ fontFamily: "var(--font-syne), sans-serif" }}>
            Load GRIDD
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-[var(--sub)] hover:bg-white/5 hover:text-[var(--text)]"
            onClick={handleClose}
          >
            ✕
          </button>
        </div>

        {!walletUnlocked ? (
          <p className="text-sm text-amber-200/90">Wallet loads unlock when your account is approved.</p>
        ) : !clientSecret ? (
          <>
            <p className="mb-3 text-xs text-[var(--sub)]">Choose an amount. Payment runs securely through Stripe only.</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS_CENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setSelectedCents(c);
                    setCustomDollars("");
                  }}
                  className={[
                    "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                    selectedCents === c
                      ? "border-[#ff6b00] bg-[#ff6b00]/15 text-[#ff9500]"
                      : "border-[var(--border)] text-[var(--sub)] hover:border-[#ff6b00]/50",
                  ].join(" ")}
                >
                  {money(c / 100)}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <label className="text-xs text-[var(--sub)]">Custom amount (USD)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 35.00"
                value={customDollars}
                onChange={(e) => {
                  setCustomDollars(e.target.value);
                  setSelectedCents(null);
                }}
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[#111] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[#ff6b00]/60"
              />
            </div>
            {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
            <Button
              type="button"
              className="mt-6 w-full min-h-[52px] text-base font-bold"
              disabled={loadingIntent || !amountCents || amountCents < 100}
              onClick={() => void startPayment()}
              style={{
                fontFamily: "var(--font-syne), ui-sans-serif, sans-serif",
                background: "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)",
                color: "#fff",
                boxShadow: "0 8px 24px rgba(255, 107, 0, 0.35)",
              }}
            >
              {loadingIntent ? "…" : "Load GRIDD ⚡"}
            </Button>
          </>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "night",
                variables: {
                  colorPrimary: "#ff6b00",
                  colorBackground: "#111111",
                  colorText: "#eeeeee",
                  borderRadius: "12px",
                },
              },
            }}
          >
            <WalletPaymentStep
              amountCents={amountCents!}
              returnPath={returnPath}
              onSuccess={onPaySuccess}
              onError={setError}
            />
            {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
            <button
              type="button"
              className="mt-4 w-full text-center text-xs text-[var(--sub)] underline-offset-2 hover:underline"
              onClick={() => {
                setClientSecret(null);
                setError(null);
              }}
            >
              ← Change amount
            </button>
          </Elements>
        )}
      </div>
    </div>
  );
}
