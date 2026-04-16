"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type GateCopy = {
  title: string;
  body: string[];
};

const defaultCopy: GateCopy = {
  title: "Before you continue",
  body: [
    "By proceeding you confirm you are at least 18 years old and agree to our Terms, Privacy Policy, and acceptable use rules.",
    "This app coordinates service requests, provider communication, and payments. Do not use it for emergencies.",
  ],
};

export function LegalGate() {
  const copy = useMemo(() => defaultCopy, []);
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <Card className="w-full max-w-xl p-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {copy.title}
            </h1>
            <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {copy.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              I agree to the{" "}
              <a className="underline underline-offset-4" href="#" onClick={(e) => e.preventDefault()}>
                Terms
              </a>
              ,{" "}
              <a className="underline underline-offset-4" href="#" onClick={(e) => e.preventDefault()}>
                Privacy Policy
              </a>
              , and platform rules.
            </span>
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-zinc-500">
              Already have an account?{" "}
              <Link className="underline underline-offset-4" href="/login">
                Log in
              </Link>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" asChild>
                <Link href="/signup">Create account</Link>
              </Button>
              <Button disabled={!accepted} asChild>
                <Link href="/home">Continue</Link>
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

