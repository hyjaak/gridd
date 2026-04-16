"use client";

import type React from "react";
import Link from "next/link";
import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  asChild?: boolean;
  href?: string;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const base =
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--brand)] text-black hover:opacity-90",
  secondary:
    "bg-[var(--card)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--brand)]",
  ghost:
    "bg-transparent text-[var(--text)] hover:bg-[var(--card)]",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", asChild, href, ...props },
  ref,
) {
  const classes = cn(base, variants[variant], className);

  if (asChild && href) {
    return (
      <Link className={classes} href={href}>
        {props.children}
      </Link>
    );
  }

  return <button ref={ref} className={classes} {...props} />;
});

