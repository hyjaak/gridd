"use client";

import { usePathname, useRouter } from "next/navigation";
import { SMART_BACK_MAP, SMART_BACK_ROOT_SCREENS, smartBackDestination } from "@/components/smartBackMap";

type SmartBackProps = {
  /** When set, overrides the static map (e.g. dynamic thread pages). */
  href?: string;
  className?: string;
  inline?: boolean;
  "aria-label"?: string;
};

export function SmartBack({
  href,
  className,
  inline = false,
  "aria-label": ariaLabel = "Back",
}: SmartBackProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  if (SMART_BACK_ROOT_SCREENS.has(pathname)) return null;

  const destination = href ?? SMART_BACK_MAP[pathname] ?? smartBackDestination(pathname);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => router.push(destination)}
      className={[
        inline
          ? "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[#1a1a1a] text-lg text-[#888] transition hover:border-[#00FF88]/45 hover:text-[#00FF88]"
          : "fixed left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] z-[100] flex h-11 min-w-11 items-center justify-center rounded-full border border-white/[0.12] bg-gradient-to-br from-[#1c1c1c] via-[#141414] to-[#0a0a0a] text-lg text-[#888] shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-md transition hover:border-[#00FF88]/45 hover:text-[#00FF88]",
        className ?? "",
      ].join(" ")}
    >
      ←
    </button>
  );
}
