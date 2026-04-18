"use client";

import { AdminCommandCenter } from "@/components/admin/AdminCommandCenter";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function AdminDashboardPage() {
  const { loading, ok } = useRequireAuth(["admin"]);

  if (loading || !ok) return <LoadingScreen />;

  return (
    <div className="page-wrapper min-h-full">
      <AdminCommandCenter />
    </div>
  );
}
