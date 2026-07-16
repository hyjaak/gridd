"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, SectionTitle, SeverityIcon } from "./ui";
import { useEvents } from "@/lib/cockpit/hooks";

export default function LiveEventFeed() {
  const { data: events } = useEvents();

  return (
    <GlassCard className="lg:col-span-2 xl:col-span-3">
      <SectionTitle title="Live Event Feed" subtitle="Real-time activity" />

      <div className="space-y-1 max-h-[280px] overflow-y-auto custom-scrollbar">
        <AnimatePresence initial={false}>
          {events.slice(0, 12).map((evt, i) => (
            <motion.div
              key={evt.id}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={{ opacity: 0, x: 20, height: 0 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/[0.02] transition-colors"
            >
              <SeverityIcon severity={evt.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white/80 font-medium">{evt.title}</p>
                  <span className="text-[10px] text-white/20 font-mono">
                    {new Date(evt.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-[11px] text-white/40 mt-0.5 truncate">{evt.description}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}