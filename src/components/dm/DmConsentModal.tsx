"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const STORAGE_KEY = "gridd_dm_consent_v1";

export function hasDmConsent(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setDmConsent(): void {
  window.localStorage.setItem(STORAGE_KEY, "1");
}

export function DmConsentModal({ onAgree }: { onAgree: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4">
      <Card className="max-w-md border border-[var(--border)] p-6">
        <div className="text-3xl">💬</div>
        <h2 className="mt-2 text-lg font-bold text-[var(--text)]">GRIDD Messages</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--sub)]">
          Keep it real, keep it respectful. Harassment or spam = instant ban.
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          By continuing you agree to our messaging rules: no harassment, no spam, no illegal content. GRIDD may
          review reported conversations. Violations can result in a permanent ban.
        </p>
        <Button type="button" className="mt-6 w-full" onClick={onAgree}>
          I Agree — Open Messages
        </Button>
      </Card>
    </div>
  );
}
