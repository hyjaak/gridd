"use client";

import React from "react";

interface RoadStripSUVProps {
  position: number;
}

/** SUV car — pure CSS 3D using transformed divs, positioned along a road strip */
export function RoadStripSUV({ position }: RoadStripSUVProps) {
  return (
    <div className="relative w-full h-20 overflow-hidden">
      {/* Road lane */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-8">
        <div className="w-full h-full rounded-full bg-[#1a1a1a] border-2 border-[#333]" />
        {/* Dashed center line */}
        <div
          className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-0.5"
          style={{
            background: "repeating-linear-gradient(90deg, #555 0px, #555 12px, transparent 12px, transparent 24px)",
          }}
        />
        {/* SUV positioned along the road */}
        <div
          className="absolute top-1/2 -translate-y-1/2 transition-all duration-800 ease-in-out"
          style={{ left: `${position}%` }}
        >
          <div className="relative w-10 h-6">
            {/* Car body */}
            <div className="absolute inset-x-0 bottom-0 h-4 bg-[#0e9f6e] rounded-sm shadow-[0_2px_6px_rgba(14,159,110,0.5)]">
              {/* Roof */}
              <div className="absolute bottom-3 left-1.5 right-1.5 h-3 bg-[#0e9f6e] rounded-t-sm" />
              {/* Windows */}
              <div className="absolute bottom-3.5 left-2 right-2 h-2 bg-[#1a3a2e] rounded-t-sm opacity-60" />
              {/* Wheels */}
              <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 rounded-full bg-[#222] border border-[#444]" />
              <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#222] border border-[#444]" />
            </div>
            {/* Bob animation */}
            <style>{`
              @keyframes carBob {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-1.5px); }
              }
            `}</style>
            <div
              className="absolute inset-0"
              style={{ animation: "carBob 2s ease-in-out infinite" }}
            />
          </div>
        </div>
      </div>
      {/* Start/end markers */}
      <div className="absolute top-1/2 left-2 -translate-y-1/2 text-[8px] font-extrabold text-[#5c6a62]">
        START
      </div>
      <div className="absolute top-1/2 right-2 -translate-y-1/2 text-[8px] font-extrabold text-[#5c6a62]">
        END
      </div>
    </div>
  );
}