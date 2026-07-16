"use client";

import React, { useEffect, useRef, useState } from "react";

interface PingToggleProps {
  onPingRef: React.RefObject<{ chime: () => void }>;
}

export function PingToggle({ onPingRef }: PingToggleProps) {
  const [pingOn, setPingOn] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const togglePing = () => {
    setPingOn((prev) => !prev);
  };

  const chime = () => {
    if (!pingOn || !audioContextRef.current) return;
    
    const ctx = audioContextRef.current;
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
  };

  useEffect(() => {
    if (pingOn && !audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioContextRef.current = new AudioContextClass();
      }
    }
    
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
  }, [pingOn]);

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
