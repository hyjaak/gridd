"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CEO_UID, SERVICES, SERVICE_AREAS, SERVICE_AREA_DEFAULT } from "@/lib/constants";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { LoadingScreen } from "@/components/LoadingScreen";

const CONFIG_DOC = "dispatchConfig";
const CONFIG_COLLECTION = "systemConfig";

type DispatchConfig = {
  prices: Record<string, number>;
  serviceAreas: string[];
  defaultArea: string;
};

const DEFAULT_CONFIG: DispatchConfig = {
  prices: Object.fromEntries(SERVICES.map((s) => [s.id, s.from])),
  serviceAreas: [...SERVICE_AREAS],
  defaultArea: SERVICE_AREA_DEFAULT,
};

export default function DispatchSettingsPage() {
  const { loading, ok, user } = useRequireAuth(["ceo"]);
  const [config, setConfig] = useState<DispatchConfig>(DEFAULT_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [areasText, setAreasText] = useState(SERVICE_AREAS.join(", "));

  useEffect(() => {
    if (!ok || user?.uid !== CEO_UID) return;
    (async () => {
      const snap = await getDoc(doc(db, CONFIG_COLLECTION, CONFIG_DOC));
      if (snap.exists()) {
        const data = snap.data() as DispatchConfig;
        setConfig(data);
        setAreasText(data.serviceAreas.join(", "));
      }
    })();
  }, [ok, user?.uid]);

  const handlePriceChange = useCallback((id: string, val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) return;
    setConfig((prev) => ({ ...prev, prices: { ...prev.prices, [id]: num } }));
    setDirty(true);
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const areas = areasText.split(",").map((s) => s.trim()).filter(Boolean);
      const updated: DispatchConfig = {
        ...config,
        serviceAreas: areas,
        defaultArea: areas[0] || SERVICE_AREA_DEFAULT,
      };
      await setDoc(doc(db, CONFIG_COLLECTION, CONFIG_DOC), updated);
      setConfig(updated);
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [config, areasText]);

  if (loading || !ok) return <LoadingScreen />;

  if (user?.uid !== CEO_UID) {
    return <div className="p-6 text-center text-red-600">Unauthorized</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dispatch Settings</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}
        {saved && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">Saved! Deploy to update the landing page prices.</div>
        )}

        {/* Prices */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Service Prices (From $)</h2>
          <div className="space-y-3">
            {SERVICES.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <label className="w-32 text-sm font-medium text-gray-700">{s.label}</label>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min={1}
                    value={config.prices[s.id] ?? s.from}
                    onChange={(e) => handlePriceChange(s.id, e.target.value)}
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e9f6e]/30"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Service Areas */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Service Areas</h2>
          <p className="text-xs text-gray-500 mb-2">Comma-separated list of cities served.</p>
          <textarea
            value={areasText}
            onChange={(e) => {
              setAreasText(e.target.value);
              setDirty(true);
              setSaved(false);
            }}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e9f6e]/30 resize-none"
          />
        </section>

        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="w-full bg-[#0e9f6e] text-white rounded-full py-3 text-sm font-semibold hover:bg-[#0c8a5e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : dirty ? "Save changes" : "No changes"}
        </button>
      </div>
    </div>
  );
}