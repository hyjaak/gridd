"use client";

import React, { useRef, useState } from "react";

interface PingToggleProps {
  onPingRef: React.RefObject<{ chime: () => void }>;
}

export function PingToggle({ onPingRef }: PingToggleProps) {
  const [pingOn, setPingOn] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Create or resume AudioContext synchronously from a user gesture (required by iOS Safari)
  const ensureAudioContext = () => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
      return audioContextRef.current;
    }
    try {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      audioContextRef.current = ctx;
      return ctx;
    } catch {
      return null;
    }
  };

  const togglePing = () => {
    // AudioContext must be created/resumed synchronously on user gesture (iOS Safari)
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    setPingOn((prev) => !prev);
  };

  const chime = () => {
    if (!pingOn) return;
    const ctx = audioContextRef.current;
    if (!ctx) return;
    
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 988;
      
      gainNode.gain.setValueAtTime(0.14, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.55);
    } catch {
      // silent — AudioContext may not be available
    }
  };

  React.useImperativeHandle(onPingRef, () => ({ chime }), [pingOn]);

  return (
    <button
      onClick={togglePing}
      className={`border font-inherit font-extrabold text-xs rounded-full px-3 py-2 cursor-pointer ${
        pingOn
          ? "bg-[#0e9f6e] border-[#0e9f6e] text-white"
          : "border-[rgba(16,22,19,0.09)] bg-white text-[#5c6a62]"
      }`}
    >
      {pingOn ? "🔔 Ping on" : "🔕 Ping"}
    </button>
  );
}
