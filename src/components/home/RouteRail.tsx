"use client";

import { useEffect, useRef, useState } from "react";

const LABELS = ["Pickup", "Job", "Price", "Moving", "Done"];
const STOPS = [0, 0.25, 0.5, 0.75, 1];

export default function RouteRail() {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const measure = () => {
      const p = Math.min(
        Math.max(
          window.scrollY /
            (document.documentElement.scrollHeight - window.innerHeight),
          0
        ),
        1
      );
      setProgress(p);
    };
    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    measure();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      className="fixed left-5 top-1/2 -translate-y-1/2 h-[48vh] w-[2px] z-20 rounded-sm"
      aria-hidden="true"
    >
      {/* Track */}
      <div className="absolute inset-0 bg-black/14 rounded-sm" />
      {/* Fill */}
      <div
        className="absolute top-0 left-0 w-full bg-[#0e9f6e] rounded-sm transition-[height] duration-75"
        style={{ height: `${Math.min(progress / 0.84, 1) * 100}%` }}
      />
      {/* Dot */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#0e9f6e] shadow-[0_0_0_4px_rgba(14,159,110,.18)] transition-[top] duration-75"
        style={{ top: `${Math.min(progress / 0.84, 1) * 100}%` }}
      />
      {/* Ticks + Labels */}
      {STOPS.map((t, i) => {
        const hit = progress / 0.84 > t - 0.02;
        return (
          <div key={i} className="absolute left-1/2" style={{ top: `${t * 100}%` }}>
            <span
              className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-[7px] h-[7px] rounded-full border-2 transition-colors ${
                hit
                  ? "border-[#0e9f6e] bg-[#0e9f6e]"
                  : "border-black/28 bg-[#eef3ef]"
              }`}
            />
            <span className="absolute left-4 -translate-y-1/2 text-[10px] font-bold tracking-[1.5px] uppercase text-black/42 whitespace-nowrap hidden md:block">
              {LABELS[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}