"use client";

import { Card } from "@/components/ui/Card";
import type { PorchPost as PorchPostModel } from "@/types";

export function PorchPost({ post }: { post: PorchPostModel }) {
  return (
    <Card className="p-4">
      <div className="text-sm font-semibold text-[var(--text)]">{post.title}</div>
      <div className="mt-1 text-xs text-[var(--sub)]">{post.createdAt}</div>
      <div className="mt-2 text-sm text-[var(--sub)]">{post.body}</div>
    </Card>
  );
}
