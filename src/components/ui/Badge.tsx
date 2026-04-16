import type React from "react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        "border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_80%,black)] text-[var(--text)]",
        className,
      )}
      {...props}
    />
  );
}

