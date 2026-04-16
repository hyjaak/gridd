"use client";

import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import type { Provider } from "@/types";

export function ProviderCard({ provider }: { provider: Provider }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar>{provider.name.slice(0, 2).toUpperCase()}</Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {provider.name}
          </div>
          <div className="truncate text-xs text-zinc-600 dark:text-zinc-300">
            {provider.city} · {provider.rating.toFixed(1)}★
          </div>
        </div>
      </div>
    </Card>
  );
}

