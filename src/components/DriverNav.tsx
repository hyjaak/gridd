"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, getFirestore, limit, onSnapshot, query, where } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { DmConversation } from "@/types";

const ITEMS = [
  { href: "/driver/jobs", label: "Jobs", emoji: "📦" },
  { href: "/active", label: "Active", emoji: "🔥" },
  { href: "/dm", label: "Messages", emoji: "💬", dmBadge: true },
  { href: "/porch", label: "Porch", emoji: "🪑" },
  { href: "/profile", label: "Profile", emoji: "👤" },
] as const;

function activeFor(pathname: string, href: string) {
  if (href === "/driver/jobs")
    return pathname === "/driver/jobs" || pathname === "/jobs";
  if (href === "/profile")
    return pathname === "/profile" || pathname.startsWith("/driver/settings");
  if (href === "/porch") return pathname === "/porch" || pathname.startsWith("/porch/");
  if (href === "/dm") return pathname === "/dm" || pathname.startsWith("/dm/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DriverNav() {
  const pathname = usePathname() ?? "";
  const { user } = useAuth();
  const [dmUnread, setDmUnread] = useState(0);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) {
      setDmUnread(0);
      return;
    }
    const db = getFirestore(firebaseApp);
    const q = query(
      collection(db, "conversations"),
      where("participants", "array-contains", user.uid),
      limit(400),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        let n = 0;
        snap.docs.forEach((d) => {
          const row = d.data() as DmConversation;
          if (row.hiddenForUsers?.includes(user.uid)) return;
          const u = row.unreadCount?.[user.uid];
          if (typeof u === "number" && u > 0) n += u;
        });
        setDmUnread(n);
      },
      () => setDmUnread(0),
    );
    return () => unsub();
  }, [user?.uid]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#060606]/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto grid w-full min-w-0 max-w-4xl grid-cols-5 gap-0 px-1 py-2 text-[10px] text-[var(--sub)] sm:gap-1 sm:px-4 sm:text-xs">
        {ITEMS.map((item) => {
          const on = activeFor(pathname, item.href);
          const showDm = "dmBadge" in item && item.dmBadge && dmUnread > 0;
          return (
            <Link
              key={item.href}
              className={[
                "relative flex min-w-0 flex-col items-center gap-0.5 py-1.5 sm:gap-1 sm:py-2",
                on ? "text-[#00FF88]" : "hover:text-[var(--text)]",
              ].join(" ")}
              href={item.href}
            >
              <span className="relative text-[1.1rem] sm:text-base">
                {item.emoji}
                {showDm ? (
                  <span className="absolute -right-2 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff6b00] px-0.5 text-[10px] font-extrabold text-white">
                    {dmUnread > 9 ? "9+" : dmUnread}
                  </span>
                ) : null}
              </span>
              <span className="max-w-[4.5rem] truncate text-center leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
