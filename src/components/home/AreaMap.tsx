"use client";

import type { MarketKey } from "@/lib/constants";
import { MARKETS } from "@/lib/constants";

type Props = {
  market: MarketKey;
};

/** Approximate relative positions for each ring town around the center */
const TOWN_POS = {
  OH: {
    center: "Dayton",
    ring: [
      { name: "Trotwood",    deg: 315 },  // NW
      { name: "Huber Heights", deg: 35 }, // NE
      { name: "Fairborn",    deg: 75 },   // E
      { name: "Beavercreek", deg: 120 },  // SE
      { name: "Kettering",   deg: 175 },  // S
      { name: "Miamisburg",  deg: 225 },  // SW
    ],
  },
  GA: {
    center: "Norcross",
    ring: [
      { name: "Peachtree Corners", deg: 310 }, // NW
      { name: "Duluth",            deg: 25 },  // NE
      { name: "Lawrenceville",     deg: 80 },  // E
      { name: "Lilburn",           deg: 130 }, // SE
      { name: "Tucker",            deg: 190 }, // S
      { name: "Doraville",         deg: 255 }, // SW
    ],
  },
} as const;

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default function AreaMap({ market }: Props) {
  const m = MARKETS[market];
  const centerLabel = m.city;
  const config = TOWN_POS[market];
  const cx = 150, cy = 150, ringR = 95, dotR = 6;

  const ringDots = config.ring.map((t) => {
    const pos = polarToCartesian(cx, cy, ringR, t.deg);
    return { ...t, x: pos.x, y: pos.y };
  });

  // Calculate bounds for viewBox with padding
  const padding = 15;
  const minX = Math.min(cx - ringR - dotR - padding, 0);
  const maxX = Math.max(cx + ringR + dotR + padding, 300);
  const minY = Math.min(cy - ringR - dotR - padding, 0);
  const maxY = Math.max(cy + ringR + dotR + padding, 300);
  const vb = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  return (
    <div className="mt-5 flex flex-col items-center">
      <svg
        viewBox={vb}
        className="w-full max-w-[320px] h-auto"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Radius ring */}
        <circle
          cx={cx}
          cy={cy}
          r={ringR}
          stroke="#0e9f6e"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.35}
        />
        {/* Ring town dots + labels */}
        {ringDots.map((t) => (
          <g key={t.name}>
            <circle cx={t.x} cy={t.y} r={dotR} fill="#0e9f6e" opacity={0.7} />
            <text
              x={t.x}
              y={t.y + dotR + 13}
              textAnchor="middle"
              fontSize={8}
              fill="#5c6a62"
              fontWeight={600}
            >
              {t.name}
            </text>
          </g>
        ))}
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={8} fill="#0e9f6e" />
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          fontSize={9}
          fill="#0e9f6e"
          fontWeight={800}
        >
          {centerLabel}
        </text>
      </svg>
      <p className="text-[11px] text-[#5c6a62] mt-1">≈ 25-mile service ring</p>
    </div>
  );
}