"use client";

const COLORS = ["#0e9f6e", "#d9a441", "#101613", "#7cc7a8"];

export function fireConfetti(pieceCount: number = 36) {
  for (let i = 0; i < pieceCount; i++) {
    const c = document.createElement("div");
    c.className = "fixed top-[-12px] w-[8px] h-[12px] z-[30] pointer-events-none";
    c.style.left = 20 + Math.random() * 60 + "vw";
    c.style.background = COLORS[i % 4];
    c.style.animation = `cf-fall ${1.6 + Math.random() * 1.6}s linear ${Math.random() * 0.5}s forwards`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3800);
  }
}
