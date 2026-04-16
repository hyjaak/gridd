"use client";

import { services } from "@/constants";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export function ServiceGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((s) => (
        <Card key={s.id} className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {s.name}
              </div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                {s.description}
              </div>
            </div>
            <Badge>{s.category}</Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}

