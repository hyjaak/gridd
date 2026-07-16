"use client";

import React from "react";
import { clsx } from "clsx";

const STAGES = ["request", "quoted", "accepted", "pickup", "in_progress", "proof", "paid"] as const;

interface MiniRailProps {
  status: string;
  dark?: boolean;
}

export function MiniRail({ status, dark = false }: MiniRailProps) {
  const currentIndex = STAGES.indexOf(status as any);
  
  return (
    <div className={clsx("flex items-center my-2", dark ? "my-3.5" : "my-2")}>
      {STAGES.map((_, i) => (
        <React.Fragment key={i}>
          <span
            className={clsx(
              "flex-none rounded-full border-2",
              dark
                ? "w-2.5 h-2.5 border-white/30 bg-transparent"
                : "w-2 h-2 border-[rgba(16,22,19,0.22)] bg-white",
              i <= currentIndex && "bg-[#0e9f6e] border-[#0e9f6e]"
            )}
          />
          {i < STAGES.length - 1 && (
            <span
              className={clsx(
                "flex-1 h-0.5",
                dark ? "bg-white/18" : "bg-[rgba(16,22,19,0.14)]",
                i < currentIndex && "bg-[#0e9f6e]"
              )}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
