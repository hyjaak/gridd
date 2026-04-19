"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Bottom nav: Jobs | Active | Wallet | Earnings | Porch | Profile */
const ITEMS = [
  { href: "/jobs", label: "Jobs", emoji: "📦" },
  { href: "/active", label: "Active", emoji: "🔥" },
  { href: "/driver/wallet", label: "Wallet", emoji: "💳" },
  { href: "/driver/earnings", label: "Earnings", emoji: "💰" },
  { href: "/porch", label: "Porch", emoji: "🪑" },
  { href: "/profile", label: "Profile", emoji: "🚛" },
] as const;

function activeFor(pathname: string, href: string) {
  if (href === "/jobs") return pathname === "/jobs" || pathname.startsWith("/driver/jobs");
  if (href === "/profile") return pathname === "/profile";
  if (href === "/driver/wallet") return pathname === "/driver/wallet" || pathname.startsWith("/driver/wallet/");
  if (href === "/driver/earnings") return pathname === "/driver/earnings" || pathname.startsWith("/driver/earnings/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DriverNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#060606]/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto grid w-full min-w-0 max-w-4xl grid-cols-6 gap-0 px-1 py-2 text-[10px] text-[var(--sub)] sm:gap-1 sm:px-4 sm:text-xs">
        {ITEMS.map((item) => {
          const on = activeFor(pathname, item.href);
          return (
            <Link
              key={item.href}
              className={[
                "flex min-w-0 flex-col items-center gap-0.5 py-1.5 sm:gap-1 sm:py-2",
                on ? "text-[#00FF88]" : "hover:text-[var(--text)]",
              ].join(" ")}
              href={item.href}
            >
              <span className="text-[1.1rem] sm:text-base">{item.emoji}</span>
              <span className="max-w-[4.5rem] truncate text-center leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
