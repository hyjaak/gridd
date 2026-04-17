"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/home", label: "Home", emoji: "⚡" },
  { href: "/book", label: "Book", emoji: "🔍" },
  { href: "/porch", label: "Porch", emoji: "🪑" },
  { href: "/wallet", label: "Wallet", emoji: "💰" },
  { href: "/history", label: "History", emoji: "📋" },
] as const;

function activeFor(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  return pathname === href || pathname.startsWith(`${href}?`) || pathname.startsWith(`${href}/`);
}

export function CustomerNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-[#060606]/95 backdrop-blur">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-5 gap-1 px-4 py-2 text-xs text-[var(--sub)]">
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
