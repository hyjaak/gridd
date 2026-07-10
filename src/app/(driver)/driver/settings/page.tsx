"use client";

import { DriverDemoChrome } from "@/components/driver/DriverDemoChrome";
import { DriverSettingsScreen } from "@/components/driver/DriverSettingsScreen";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function DriverSettingsPage() {
  const { loading, ok } = useRequireAuth(["driver"]);

  if (loading || !ok) {
    return <LoadingScreen />;
  }

  return (
    <>
      <DriverDemoChrome />
      <DriverSettingsScreen />
    </>
  );
}
