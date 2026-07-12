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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          e.target.classList.toggle("on", e.isIntersecting);
        });
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      id={id}
      ref={ref}
      className={`min-h-screen flex items-center px-[7vw] ${
        align === "right" ? "justify-end" : ""
      }`}
    >
      <div className="max-w-[530px] bg-white/88 backdrop-blur-md border border-black/8 rounded-3xl px-[38px] py-10 shadow-[0_30px_70px_rgba(16,22,19,.12)] opacity-0 translate-y-[30px] transition-all duration-700 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 [&.on]:opacity-100 [&.on]:translate-y-0">
        {children}
      </div>
    </section>
  );
}