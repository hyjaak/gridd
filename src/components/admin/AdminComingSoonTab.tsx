"use client";

/**
 * Placeholder when a dashboard section has no dedicated UI yet.
 */
export function AdminComingSoonTab({ tabName }: { tabName: string }) {
  return (
    <div
      className="mx-auto max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950/60 px-6 py-16 text-center"
      style={{ color: "#a1a1aa" }}
    >
      <div className="text-4xl" aria-hidden>
        🔧
      </div>
      <div
        className="mt-4 text-sm text-zinc-400"
        style={{ fontFamily: "var(--font-syne), Syne, system-ui, sans-serif" }}
      >
        {tabName} coming soon
      </div>
    </div>
  );
}
