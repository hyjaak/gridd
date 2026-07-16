"use client";

import { CEO_UID } from "@/lib/constants";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import CockpitHeader from "@/components/cockpit/CockpitHeader";
import LiveMap from "@/components/cockpit/LiveMap";
import DispatchQueue from "@/components/cockpit/DispatchQueue";
import AICommandCenter from "@/components/cockpit/AICommandCenter";
import InventoryPanel from "@/components/cockpit/InventoryPanel";
import PricingEngine from "@/components/cockpit/PricingEngine";
import DriverPanel from "@/components/cockpit/DriverPanel";
import FleetPanel from "@/components/cockpit/FleetPanel";
import AnalyticsPanel from "@/components/cockpit/AnalyticsPanel";
import WeatherPanel from "@/components/cockpit/WeatherPanel";
import FuelPanel from "@/components/cockpit/FuelPanel";
import LiveEventFeed from "@/components/cockpit/LiveEventFeed";

export default function CockpitPage() {
  const { loading, ok, user } = useRequireAuth(["ceo"]);

  if (loading || !ok) return <LoadingScreen />;
  if (user?.uid !== CEO_UID) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-red-400 text-sm">Unauthorized — CEO access only</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* DEMO BANNER */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/20 backdrop-blur border-b border-amber-500/30 text-center py-2 text-[11px] font-semibold text-amber-400 tracking-wider uppercase">
        DEMO — sample data, not live operations
      </div>

      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-black to-zinc-900 z-0" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.03)_0%,transparent_60%)] z-0" />

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen pt-10">
        <CockpitHeader />
        <main className="flex-1 p-4 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 auto-rows-min">
            <LiveMap />
            <DispatchQueue />
            <AICommandCenter />
            <InventoryPanel />
            <PricingEngine />
            <DriverPanel />
            <FleetPanel />
            <AnalyticsPanel />
            <WeatherPanel />
            <FuelPanel />
            <LiveEventFeed />
          </div>
        </main>
      </div>
    </div>
  );
}