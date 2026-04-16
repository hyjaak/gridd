"use client";

import { useCallback, useState } from "react";

export function useNotifications() {
  const [lastResult, setLastResult] = useState<unknown>(null);

  const notify = useCallback(async (payload: unknown) => {
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    setLastResult(json);
    return { ok: res.ok, json };
  }, []);

  return { notify, lastResult };
}

