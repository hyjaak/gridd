import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trust & Safety — GRIDD",
  description: "How GRIDD keeps neighbors and drivers safe.",
};

export default function TrustPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-[#060606] px-6 py-14 text-zinc-200">
      <p className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="text-[#ff6b00] hover:underline">
          ← Home
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-zinc-100">Trust &amp; Safety</h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        GRIDD combines verified drivers, transparent community rules, in-app job chat, and human review for serious
        issues. Reports and GRIDD Scores help keep the marketplace fair; repeated or severe issues can lead to
        suspension.
      </p>
      <ul className="mt-8 space-y-3 text-sm text-zinc-300">
        <li>🪑 Porch + community rules</li>
        <li>🚛 Driver documents + CEO approval</li>
        <li>💬 Job-linked chat</li>
        <li>👑 Admin oversight</li>
      </ul>
      <p className="mt-8 text-sm">
        <Link href="/rules" className="text-[#ff6b00] hover:underline">
          Community guidelines
        </Link>
        {" · "}
        <Link href="/driver-rules" className="text-[#ff6b00] hover:underline">
          Driver code
        </Link>
      </p>
    </main>
  );
}
