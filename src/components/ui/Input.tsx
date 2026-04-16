"use client";

import type React from "react";
import { forwardRef } from "react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-xl border px-3 text-sm outline-none ring-0",
          "border-[var(--border)] bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--sub)] focus:border-[var(--brand)]",
          className,
        )}
        {...props}
      />
    );
  },
);

