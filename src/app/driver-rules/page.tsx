import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Driver Code of Conduct — GRIDD",
  description: "GRIDD driver standards and professional expectations.",
};

export default function DriverRulesPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-[#060606] px-6 py-14 text-zinc-200">
      <p className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="text-[#ff6b00] hover:underline">
          ← Home
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-[#ff6b00]">GRIDD Driver Standards 🚛</h1>
      <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-zinc-300">
        <li>Be on time — always</li>
        <li>Professional at all times</li>
        <li>Keep your vehicle clean</li>
        <li>Never cancel last minute</li>
        <li>Respect customer property</li>
        <li>One gig at a time</li>
        <li>CEO approval required</li>
      </ol>
      <h2 className="mt-10 text-lg font-bold text-zinc-100">Insurance (drivers)</h2>
      <p className="mt-2 text-sm text-zinc-500">
        By driving on GRIDD you are expected to maintain the coverage and acknowledgements you agreed to at
        onboarding, including:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-300">
        <li>Valid personal auto insurance at all times</li>
        <li>Commercial auto coverage or a commercial endorsement while using the platform for work</li>
        <li>Understanding that GRIDD is not responsible for accidents, injuries, or damages during jobs</li>
        <li>Your insurance is primary for incidents while you use the platform</li>
        <li>Notify GRIDD if coverage lapses or is cancelled; failure to maintain required insurance may
          result in suspension</li>
      </ul>
      <p className="mt-8 rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-200/90">
        Violations may lead to suspension and, in serious cases, permanent removal from the platform.
      </p>
    </main>
  );
}
