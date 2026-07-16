"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ===== Glass Card (foundation for every widget) =====
export function GlassCard({
  children,
  className,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "rounded-3xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-5",
        hover && "hover:bg-white/[0.06] hover:border-white/[0.10] transition-all duration-300",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

// ===== Glass Header =====
export function GlassHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      {children}
    </div>
  );
}

// ===== Status Badge =====
const STATUS_COLORS: Record<string, string> = {
  online: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  offline: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  "en-route": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  break: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  maintenance: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  pending: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  "in-transit": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  delivered: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  low: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  high: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  urgent: "bg-red-500/20 text-red-400 border-red-500/30",
  info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  error: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border uppercase tracking-wider",
        STATUS_COLORS[status] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
        className
      )}
    >
      {status}
    </span>
  );
}

// ===== Pulse Dot =====
export function PulseDot({ color = "bg-emerald-500" }: { color?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}

// ===== Metric Tile =====
export function MetricTile({ label, value, change, icon }: { label: string; value: string; change?: string; icon?: ReactNode }) {
  const isPositive = change?.startsWith("+");
  return (
    <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
      <div className="flex items-center gap-3">
        {icon && <span className="text-white/40">{icon}</span>}
        <div>
          <p className="text-[11px] text-white/40 font-medium uppercase tracking-wider">{label}</p>
          <p className="text-lg font-semibold text-white mt-0.5">{value}</p>
        </div>
      </div>
      {change && (
        <span className={cn(
          "text-xs font-semibold px-2 py-1 rounded-full",
          isPositive ? "text-emerald-400 bg-emerald-500/15" : "text-red-400 bg-red-500/15"
        )}>
          {change}
        </span>
      )}
    </div>
  );
}

// ===== Progress Bar =====
export function ProgressBar({ value, max = 100, color = "bg-emerald-500" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  );
}

// ===== Severity Icon =====
export function SeverityIcon({ severity }: { severity: string }) {
  const map: Record<string, { icon: string; color: string }> = {
    success: { icon: "✓", color: "text-emerald-400" },
    info: { icon: "i", color: "text-blue-400" },
    warning: { icon: "!", color: "text-amber-400" },
    error: { icon: "✕", color: "text-red-400" },
  };
  const m = map[severity] || map.info;
  return (
    <span className={`w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] font-bold ${m.color}`}>
      {m.icon}
    </span>
  );
}

// ===== Section Title =====
export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-[11px] text-white/40 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}