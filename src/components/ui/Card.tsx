import type React from "react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border shadow-sm",
        "border-[var(--border)] bg-[var(--card)] text-[var(--text)]",
        className,
      )}
      {...props}
    />
  );
}

