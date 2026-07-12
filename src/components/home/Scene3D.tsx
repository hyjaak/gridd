"use client";

import { useEffect, useRef, useCallback } from "react";
import { buildScene, type SceneHandle } from "./scene";

type Props = {
  market: "OH" | "GA";
  onPhoto?: (dataUrl: string) => void;
  onDelivered?: (delivered: boolean) => void;
};

export default function Scene3D({ market, onPhoto, onDelivered }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);

  const init = useCallback(() => {
    if (!containerRef.current || handleRef.current) return;
    handleRef.current = buildScene(containerRef.current, {
      onPhoto,
      onDelivered,
    });
  }, [onPhoto, onDelivered]);

  useEffect(() => {
    init();
    return () => {
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [init]);

  useEffect(() => {
    handleRef.current?.setMarket(market);
  }, [market]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}