"use client";

import { AdminCommandCenter } from "@/components/admin/AdminCommandCenter";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function AdminDashboardPage() {
  const { loading, ok } = useRequireAuth(["ceo"]);

  if (loading || !ok) return <LoadingScreen />;

  return (
    <div className="w-full min-h-0">
      <AdminCommandCenter />
    </div>
  );
}
