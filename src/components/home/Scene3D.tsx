"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { buildScene, type SceneHandle } from "./scene";

type Props = {
  market: "OH" | "GA";
  onPhoto?: (dataUrl: string) => void;
  onDelivered?: (delivered: boolean) => void;
};

function canWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return false;
    // Also check GL context actually works
    const status = (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    if (status) (status as any).restoreContext?.();
    return true;
  } catch { return false; }
}

export default function Scene3D({ market, onPhoto, onDelivered }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!canWebGL()) { setSupported(false); return; }
    setSupported(true);
  }, []);

  const init = useCallback(() => {
    if (!containerRef.current || handleRef.current || !supported) return;
    try {
      handleRef.current = buildScene(containerRef.current, { onPhoto, onDelivered });
    } catch { setSupported(false); }
  }, [onPhoto, onDelivered, supported]);

  useEffect(() => {
    if (!supported) return;
    init();
    return () => {
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [init, supported]);

  useEffect(() => {
    if (supported) handleRef.current?.setMarket(market);
  }, [market, supported]);

  if (!supported) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}