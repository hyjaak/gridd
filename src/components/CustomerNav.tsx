"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, getFirestore, limit, onSnapshot, query, where } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { DmConversation } from "@/types";

const ITEMS = [
  { href: "/home", label: "Home", emoji: "⚡" },
  { href: "/book", label: "Book", emoji: "🔍" },
  { href: "/bites", label: "Bites", emoji: "🍗", bitesBadge: true },
  { href: "/porch", label: "Porch", emoji: "🪑" },
  { href: "/dm", label: "Messages", emoji: "💬", dmBadge: true },
  { href: "/profile", label: "Profile", emoji: "👤" },
] as const;

function activeFor(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  if (href === "/profile") return pathname === "/profile";
  if (href === "/dm") return pathname === "/dm" || pathname.startsWith("/dm/");
  if (href === "/bites") return pathname === "/bites" || pathname.startsWith("/bites/");
  if (href === "/porch") return pathname === "/porch" || pathname.startsWith("/porch/");
  return pathname === href || pathname.startsWith(`${href}?`) || pathname.startsWith(`${href}/`);
}

export function CustomerNav() {
  const pathname = usePathname() ?? "";
  const { user } = useAuth();
  const [dmUnread, setDmUnread] = useState(0);
  const [bitesHot, setBitesHot] = useState(false);

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

  useEffect(() => {
    if (!firebaseApp || !user?.uid) {
      setBitesHot(false);
      return;
    }
    const db = getFirestore(firebaseApp);
    const q = query(collection(db, "biteOrders"), where("isPublic", "==", true), limit(1));
    const unsub = onSnapshot(
      q,
      (snap) => setBitesHot(snap.docs.length > 0),
      () => setBitesHot(false),
    );
    return () => unsub();
  }, [user?.uid]);

  /** Bites is full-screen; hide bottom nav under /bites */
  if (pathname.startsWith("/bites")) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-[#060606]/95 backdrop-blur">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-6 gap-1 px-2 py-2 text-xs text-[var(--sub)] sm:px-4">
        {ITEMS.map((item) => {
          const on = activeFor(pathname, item.href);
          const showDm = "dmBadge" in item && item.dmBadge && dmUnread > 0;
          const showBites =
            "bitesBadge" in item && item.bitesBadge && bitesHot && !on;
          return (
            <Link
              key={item.href}
              className={[
                "relative flex flex-col items-center gap-1 py-2",
                on ? "text-[#00FF88]" : "hover:text-[var(--text)]",
              ].join(" ")}
              href={item.href}
            >
              <span className="relative">
                {item.emoji}
                {showDm ? (
                  <span className="absolute -right-2 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff6b00] px-0.5 text-[10px] font-extrabold text-white">
                    {dmUnread > 9 ? "9+" : dmUnread}
                  </span>
                ) : null}
                {showBites ? (
                  <span
                    className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-[#ff6b00] shadow-[0_0_8px_#ff6b00]"
                    title="Something trending in Bites"
                    aria-hidden
                  />
                ) : null}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
