"use client";

import React, { useEffect, useState } from "react";

interface FlashConfettiProps {
  trigger: boolean;
  onComplete?: () => void;
}

export function FlashConfetti({ trigger, onComplete }: FlashConfettiProps) {
  const [showFlash, setShowFlash] = useState(false);
  const [confettiPieces, setConfettiPieces] = useState<Array<{ id: number; left: string; bg: string; duration: string; delay: string }>>([]);

  useEffect(() => {
    if (trigger) {
      setShowFlash(true);
      
      const colors = ["#0e9f6e", "#d9a441", "#101613", "#7cc7a8"];
      const pieces = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        left: `${15 + Math.random() * 70}vw`,
        bg: colors[i % 4],
        duration: `${1.4 + Math.random() * 1.4}s`,
        delay: `${Math.random() * 0.4}s`,
      }));
      setConfettiPieces(pieces);

      setTimeout(() => setShowFlash(false), 90);
      setTimeout(() => {
        setConfettiPieces([]);
        onComplete?.();
      }, 3200);
    }
  }, [trigger, onComplete]);

  return (
    <>
      {showFlash && (
        <div className="fixed inset-0 bg-white opacity-80 pointer-events-none z-55" />
      )}
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="fixed top-[-12px] w-2 h-3 z-60 pointer-events-none"
          style={{
            left: piece.left,
            background: piece.bg,
            animation: `fall ${piece.duration} linear forwards`,
            animationDelay: piece.delay,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes fall {
          to {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0.2;
          }
        }
      `}</style>
    </>
  );
}
