"use client";

import { useState, useRef, useEffect } from "react";

type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

function getSR(): SR | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = "en-US";
  r.interimResults = false;
  r.continuous = false;
  return r as SR;
}

/** 🎤 Voice input — Web Speech API only, hidden entirely if unsupported. No audio playback. */
export default function VoiceInput({ onTranscript, label = "🎤 Say it instead" }: {
  onTranscript: (text: string) => void;
  label?: string;
}) {
  const [supported] = useState(() => !!getSR());
  const [listening, setListening] = useState(false);
  const recRef = useRef<SR | null>(null);

  useEffect(() => {
    return () => { recRef.current?.stop(); };
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = getSR();
    if (!rec) return;
    recRef.current = rec;
    rec.onresult = (e: any) => {
      const text = Array.from(e.results ?? [])
        .map((r: any) => r[0]?.transcript ?? "")
        .join(" ");
      if (text.trim()) onTranscript(text.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };

  return (
    <button type="button" onClick={toggle}
      className={`text-[12px] font-extrabold rounded-full px-3 py-1.5 border-none cursor-pointer transition-colors ${
        listening ? "bg-[#c0392b] text-white animate-pulse" : "bg-[#101613] text-white hover:bg-[#1a1a1a]"
      }`}>
      {listening ? "⏹ Stop" : label}
    </button>
  );
}