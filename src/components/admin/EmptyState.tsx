"use client";

export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center">
      <div className="text-4xl">{icon}</div>
      <div
        className="mt-3 text-sm"
        style={{
          fontFamily: "var(--font-syne), ui-sans-serif, system-ui, sans-serif",
          color: "#c4c4c4",
          whiteSpace: "pre-line",
        }}
      >
        {message}
      </div>
    </div>
  );
}

