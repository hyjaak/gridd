"use client";

import { useEffect, useRef } from "react";

type Props = {
  children: React.ReactNode;
  align?: "left" | "right";
  id?: string;
};

export default function ScrollSection({
  children,
  align = "left",
  id,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const card = cardRef.current;
    if (!el || !card) return;

    let done = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    // Determine if card is below the fold
    const rect = el.getBoundingClientRect();
    const belowFold = rect.top > window.innerHeight;

    if (belowFold) {
      card.classList.add("pre");
    } else {
      // Already visible — no animation needed
      card.classList.add("on");
      return;
    }

    // Fallback: if observer doesn't fire within 2s of entering viewport, force visible
    const scrollCheck = () => {
      if (done) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9 && r.bottom > 0) {
        done = true;
        card.classList.remove("pre");
        card.classList.add("on");
        window.removeEventListener("scroll", scrollCheck);
        if (fallbackTimer) clearTimeout(fallbackTimer);
      }
    };

    try {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              done = true;
              card.classList.remove("pre");
              card.classList.add("on");
              io.disconnect();
              window.removeEventListener("scroll", scrollCheck);
              if (fallbackTimer) clearTimeout(fallbackTimer);
            }
          }
        },
        { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
      );
      io.observe(el);

      // Safety timeout: force visible after 2s of being scrolled into view
      fallbackTimer = setTimeout(() => {
        if (!done) {
          scrollCheck();
        }
      }, 2000);

      window.addEventListener("scroll", scrollCheck, { passive: true });

      return () => {
        io.disconnect();
        window.removeEventListener("scroll", scrollCheck);
        if (fallbackTimer) clearTimeout(fallbackTimer);
      };
    } catch {
      // Observer failed (SSR, old browser) — force visible
      card.classList.remove("pre");
      card.classList.add("on");
    }
  }, []);

  return (
    <section
      id={id}
      ref={ref}
      className={`min-h-screen flex items-center px-[7vw] ${
        align === "right" ? "justify-end" : ""
      }`}
    >
      <div
        ref={cardRef}
        className="max-w-[530px] bg-white/88 backdrop-blur-md border border-black/8 rounded-3xl px-[38px] py-10 shadow-[0_30px_70px_rgba(16,22,19,.12)] opacity-100 motion-reduce:opacity-100 motion-reduce:translate-y-0 [&.pre]:opacity-0 [&.pre]:translate-y-[30px] [&.on]:opacity-100 [&.on]:translate-y-0 transition-all duration-700 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
      >
        {children}
      </div>
    </section>
  );
}