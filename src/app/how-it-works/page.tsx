import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How GRIDD Works",
  description: "Book services, get matched, track jobs, and pay through GRIDD.",
};

export default function HowItWorksPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-[#060606] px-6 py-14 text-zinc-200">
      <p className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="text-[#ff6b00] hover:underline">
          ← Home
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-zinc-100">How GRIDD works</h1>
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-[#00FF88]">For customers</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
        <li>Book a service</li>
        <li>Get matched with a driver</li>
        <li>Track in real time</li>
        <li>Pay through GRIDD</li>
        <li>Rate your experience</li>
      </ol>
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-[#ff6b00]">For drivers</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
        <li>Apply and get approved by CEO</li>
        <li>Go ON THE GRIDD ⚡</li>
        <li>Accept jobs in your area</li>
        <li>Complete work and get paid</li>
        <li>Build your reputation</li>
      </ol>
    </main>
  );
}
