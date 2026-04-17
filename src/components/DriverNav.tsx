"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/jobs", label: "Jobs", emoji: "📦" },
  { href: "/active", label: "Active", emoji: "🔥" },
  { href: "/driver/earnings", label: "Earnings", emoji: "💰" },
  { href: "/porch", label: "Porch", emoji: "🪑" },
  { href: "/profile", label: "Profile", emoji: "🚛" },
] as const;

function activeFor(pathname: string, href: string) {
  if (href === "/jobs") return pathname === "/jobs" || pathname.startsWith("/driver/jobs");
  if (href === "/profile") return pathname === "/profile";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DriverNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#060606]/95 backdrop-blur">
      <div className="mx-auto grid max-w-4xl grid-cols-5 gap-1 px-4 py-2 text-xs text-[var(--sub)]">
        {ITEMS.map((item) => {
          const on = activeFor(pathname, item.href);
          return (
            <Link
              key={item.href}
              className={[
                "flex flex-col items-center gap-1 py-2",
                on ? "text-[#00FF88]" : "hover:text-[var(--text)]",
              ].join(" ")}
              href={item.href}
            >
              <span>{item.emoji}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
