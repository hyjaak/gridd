"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CustomerNav } from "@/components/CustomerNav";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";

/**
 * Group order: `gridd.click/bites/group/xxx` — host + participants add items, one pay, one delivery.
 */
export default function BitesGroupPage() {
  const { loading, ok } = useRequireAuth(["customer", "ceo"]);
  const params = useParams();
  const groupId = typeof params.groupId === "string" ? params.groupId : "";

  if (loading || !ok) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-[#060606] pb-28 text-[var(--text)]">
      <header className="border-b border-[var(--border)] px-4 py-2">
        <BackButton href="/bites" />
      </header>
      <main className="space-y-4 px-4 py-4">
        <h1 className="text-xl font-bold">Squad order</h1>
        <p className="text-sm text-zinc-500">Group: {groupId || "new"}</p>
        <Card className="p-4 text-sm text-zinc-400">
          Share this link:{" "}
          <code className="text-[#00FF88]">
            {typeof window !== "undefined" ? window.location.origin : ""}/bites/group/{groupId}
          </code>
        </Card>
        <p className="text-sm">Friends add items here; host locks & pays. Feed card: &quot;Squad order from Wingstop · 4
          people&quot; (wire to `biteGroupOrders`).</p>
        <Button asChild className="w-full">
          <Link href="/bites/checkout">Continue to checkout (host)</Link>
        </Button>
      </main>
      <CustomerNav />
    </div>
  );
}
