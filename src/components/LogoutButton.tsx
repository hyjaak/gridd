"use client";

import { logOut } from "@/lib/auth";

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
  return (
    <button
      type="button"
      onClick={() => void logOut()}
      className={
        className ??
        "rounded-[10px] border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-xs font-semibold text-[#888] transition hover:border-white/20 hover:text-[var(--text)]"
      }
    >
      Sign Out
    </button>
  );
}
