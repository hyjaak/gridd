import type React from "react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Avatar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border text-xs font-medium",
        "border-[var(--border)] bg-[var(--card)] text-[var(--text)]",
        className,
      )}
      {...props}
    />
  );
}

