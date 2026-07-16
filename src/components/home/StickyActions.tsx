"use client";

import { useEffect, useRef, useState } from "react";
import { PHONE_HREF, SMS_HREF } from "@/lib/constants";

type Props = {
  onQuote?: () => void;
};

export default function StickyActions({ onQuote }: Props) {
  const [hidden, setHidden] = useState(false);
  const bookSecRef = useRef<Element | null>(null);

  useEffect(() => {
    bookSecRef.current = document.getElementById("bookSec");
    const target = bookSecRef.current;
    if (!target) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        setHidden(entry.isIntersecting);
      },
      { threshold: 0.2 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#101613] text-white transition-transform duration-300 ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch">
        <a
          href={PHONE_HREF}
          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-[14px] font-bold no-underline text-white hover:bg-white/10 transition-colors border-r border-white/10"
        >
          📞 Call
        </a>
        <a
          href={SMS_HREF}
          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-[14px] font-bold no-underline text-white hover:bg-white/10 transition-colors border-r border-white/10"
        >
          💬 Text
        </a>
        <button
          onClick={onQuote}
          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 text-[14px] font-bold no-underline text-white bg-[#0e9f6e] hover:bg-[#0a7a54] transition-colors border-none cursor-pointer"
        >
          Get quote
        </button>
      </div>
    </div>
  );
}