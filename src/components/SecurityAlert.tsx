"use client";

import { Card } from "@/components/ui/Card";

export function SecurityAlert({ title, body }: { title: string; body: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="text-sm font-semibold text-amber-950 dark:text-amber-200">
        {title}
      </div>
      <div className="mt-1 text-xs text-amber-800 dark:text-amber-300">{body}</div>
    </Card>
  );
}

