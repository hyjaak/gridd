"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const HIDDEN_PATHS = new Set(["/", "/home", "/jobs", "/admin/dashboard"]);

function cn(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type BackButtonProps = {
  /** If set, navigates here. Otherwise uses browser history when available. */
  href?: string;
  "aria-label"?: string;
  className?: string;
  /** Sits in the document flow (e.g. header row) instead of fixed top-left. */
  inline?: boolean;
};

const baseStyles =
  "group flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-white/[0.12] " +
  "bg-gradient-to-br from-[#1c1c1c] via-[#141414] to-[#0a0a0a] " +
  "text-[var(--text)] shadow-[0_8px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] " +
  "backdrop-blur-md transition-all duration-200 " +
  "hover:border-[#00FF88]/45 hover:text-[#00FF88] hover:shadow-[0_0_32px_rgba(0,255,136,0.18)] " +
  "active:scale-[0.96] active:brightness-95 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF88] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060606] " +
  "sm:min-w-[5.5rem] sm:justify-start sm:pl-3.5 sm:pr-4";

/**
 * Back control. Hidden on root landing / home / driver jobs / admin dashboard.
 * Default: fixed top-left. Use `inline` inside a header row. Add `pt-16` to `<main>` when using fixed.
 */
export function BackButton({
  href,
  "aria-label": ariaLabel = "Back",
  className,
  inline = false,
}: BackButtonProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    setHasHistory(typeof window !== "undefined" && window.history.length > 1);
  }, []);

  if (!pathname || HIDDEN_PATHS.has(pathname)) return null;
  if (!href && !hasHistory) return null;

  function onClick() {
    if (href) router.push(href);
    else router.back();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        baseStyles,
        inline
          ? "relative z-10 shrink-0"
          : "fixed left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] z-[100]",
        className,
      )}
    >
      <ArrowLeft
        className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5 sm:h-5 sm:w-5"
        strokeWidth={2.25}
      />
      <span className="hidden text-sm font-semibold tracking-tight sm:inline">Back</span>
    </button>
  );
}
