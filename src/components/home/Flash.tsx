"use client";

import { useEffect, useRef } from "react";

type Props = {
  trigger: number;
};

export default function Flash({ trigger }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (trigger > 0) {
      const el = ref.current;
      if (!el) return;
      el.classList.add("opacity-85");
      const timer = setTimeout(() => el.classList.remove("opacity-85"), 90);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  return (
    <div
      ref={ref}
      className="fixed inset-0 bg-white opacity-0 pointer-events-none z-40 transition-opacity duration-100"
    />
  );
}