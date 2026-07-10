import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community Guidelines — GRIDD",
  description: "The Porch rules and neighbor standards on GRIDD.",
};

export default function RulesPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-[#060606] px-6 py-14 text-zinc-200">
      <p className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="text-[#ff6b00] hover:underline">
          ← Home
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-[#D4A574]">The Porch Rules 🪑</h1>
      <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-zinc-300">
        <li>Keep it real — no fake posts</li>
        <li>Respect your neighbors</li>
        <li>No spam or self-promotion</li>
        <li>No harassment or threats</li>
        <li>No illegal activity</li>
        <li>GRIDD IT ‼️ responsibly</li>
      </ol>
      <p className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
        Violations may result in score penalties and possible suspension, consistent with our{" "}
        <Link href="/trust" className="text-[#ff6b00] hover:underline">
          Trust &amp; Safety
        </Link>{" "}
        practices.
      </p>
    </main>
  );
}
