"use client";

import { useMemo, useState } from "react";
import {
  collection,
  doc,
  getFirestore,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import app from "@/lib/firebase";

type MenuDraft = {
  category: string;
  name: string;
  description: string;
  price: string;
  photoUrl: string;
  available: boolean;
  calories: string;
};

const emptyMenuRow = (): MenuDraft => ({
  category: "",
  name: "",
  description: "",
  price: "",
  photoUrl: "",
  available: true,
  calories: "",
});

function parseHoursJson(raw: string): Record<string, unknown> {
  const t = raw.trim();
  if (!t) return {};
  try {
    const j = JSON.parse(t) as unknown;
    if (j && typeof j === "object" && !Array.isArray(j)) return j as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  return { summary: t };
}

export function AdminManualRestaurantForm() {
  const db = useMemo(() => getFirestore(app), []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("3.99");
  const [minOrder, setMinOrder] = useState("0");
  const [estimatedTime, setEstimatedTime] = useState("30–45 min");
  const [priceRange, setPriceRange] = useState("$$");
  const [hoursJson, setHoursJson] = useState(`{
  "mon": "11a–9p",
  "tue": "11a–9p",
  "wed": "11a–9p",
  "thu": "11a–9p",
  "fri": "11a–10p",
  "sat": "11a–10p",
  "sun": "12p–8p"
}`);
  const [imageUrl, setImageUrl] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [menuRows, setMenuRows] = useState<MenuDraft[]>([emptyMenuRow()]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function addMenuRow() {
    setMenuRows((r) => [...r, emptyMenuRow()]);
  }

  function updateMenuRow(i: number, patch: Partial<MenuDraft>) {
    setMenuRows((rows) => rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function onSave() {
    setErr(null);
    setMsg(null);
    if (!name.trim() || !address.trim() || !phone.trim()) {
      setErr("Name, address, and phone are required.");
      return;
    }
    const df = Number(deliveryFee);
    const mo = Number(minOrder);
    if (!Number.isFinite(df) || !Number.isFinite(mo)) {
      setErr("Delivery fee and min order must be numbers.");
      return;
    }
    const validItems = menuRows.filter((r) => r.name.trim() && r.category.trim());
    if (validItems.length === 0) {
      setErr("Add at least one menu item with category and name.");
      return;
    }
    setBusy(true);
    try {
      const rid = doc(collection(db, "restaurants")).id;
      const batch = writeBatch(db);
      const rootRef = doc(db, "restaurants", rid);
      batch.set(rootRef, {
        name: name.trim(),
        cuisine: cuisine.trim() || "Local",
        address: address.trim(),
        phone: phone.trim(),
        deliveryFee: df,
        minOrder: mo,
        estimatedTime: estimatedTime.trim() || "30–45 min",
        priceRange: priceRange.trim() || "$$",
        hours: parseHoursJson(hoursJson),
        imageUrl: imageUrl.trim(),
        isOpen,
        isManualEntry: true,
        addedByCEO: true,
        createdAt: serverTimestamp(),
        source: "manual",
        lat: lat.trim() ? Number(lat) : 0,
        lng: lng.trim() ? Number(lng) : 0,
      });

      validItems.forEach((row, i) => {
        const mid = doc(collection(db, "restaurants", rid, "menuItems")).id;
        const mref = doc(db, "restaurants", rid, "menuItems", mid);
        const p = Number(row.price);
        const cal = row.calories.trim();
        batch.set(mref, {
          category: row.category.trim(),
          name: row.name.trim(),
          description: row.description.trim(),
          price: Number.isFinite(p) ? p : 0,
          photoUrl: row.photoUrl.trim(),
          imageUrl: row.photoUrl.trim(),
          available: row.available,
          isAvailable: row.available,
          ...(cal ? { calories: Number(cal) || 0 } : {}),
          sortOrder: i,
        });
      });

      await batch.commit();
      setMsg(`Saved — restaurant id: ${rid}. It appears in Bites after the next feed load.`);
      setName("");
      setCuisine("");
      setAddress("");
      setPhone("");
      setMenuRows([emptyMenuRow()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const BORDER = "#1e1e1e";
  const CARD = "#111";

  return (
    <div className="rounded-xl border p-3" style={{ background: CARD, borderColor: BORDER }}>
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-sm font-bold text-zinc-200"
        onClick={() => setOpen((v) => !v)}
      >
        <span>➕ Add manual restaurant (Bites)</span>
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="mt-4 space-y-3 text-xs">
          <p className="text-zinc-500">
            Creates <span className="font-mono text-zinc-400">restaurants/&#123;id&#125;</span> with{" "}
            <span className="font-mono">menuItems</span> until Drive APIs are live. Orders skip DoorDash and show as{" "}
            <span className="font-mono text-amber-200">manual_pending</span>.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-zinc-500">Restaurant name</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-zinc-100"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-zinc-500">Cuisine type</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-zinc-100"
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
                placeholder="e.g. Pizza, Mexican"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-zinc-500">Address</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-zinc-100"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-zinc-500">Phone</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-zinc-100"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-zinc-500">Cover photo URL</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-zinc-100"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-zinc-500">Delivery fee ($)</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-zinc-100"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-zinc-500">Min order ($)</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-zinc-100"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-zinc-500">Est. delivery time</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-zinc-100"
                value={estimatedTime}
                onChange={(e) => setEstimatedTime(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-zinc-500">Price range</span>
              <select
                className="w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-zinc-100"
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value)}
              >
                {(["$", "$$", "$$$", "$$$$"] as const).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-6">
              <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} />
              <span className="text-zinc-400">Restaurant is open</span>
            </label>
            <label className="block space-y-1">
              <span className="text-zinc-500">Lat (optional)</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-zinc-100"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="33.74"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-zinc-500">Lng (optional)</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 text-zinc-100"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-84.39"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-zinc-500">Opening hours (JSON object or free text)</span>
            <textarea
              className="min-h-[100px] w-full rounded-lg border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-zinc-100"
              value={hoursJson}
              onChange={(e) => setHoursJson(e.target.value)}
            />
          </label>

          <div className="border-t border-zinc-800 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-zinc-300">Menu items</p>
              <button
                type="button"
                className="rounded-lg border border-zinc-600 px-2 py-1 text-[11px] text-zinc-300"
                onClick={addMenuRow}
              >
                + Row
              </button>
            </div>
            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {menuRows.map((row, i) => (
                <div key={i} className="grid gap-1 rounded-lg border border-zinc-800 p-2 sm:grid-cols-6">
                  <input
                    placeholder="Category"
                    className="rounded border border-zinc-700 bg-black/30 px-2 py-1 sm:col-span-2"
                    value={row.category}
                    onChange={(e) => updateMenuRow(i, { category: e.target.value })}
                  />
                  <input
                    placeholder="Item name"
                    className="rounded border border-zinc-700 bg-black/30 px-2 py-1 sm:col-span-2"
                    value={row.name}
                    onChange={(e) => updateMenuRow(i, { name: e.target.value })}
                  />
                  <input
                    placeholder="Price"
                    className="rounded border border-zinc-700 bg-black/30 px-2 py-1"
                    value={row.price}
                    onChange={(e) => updateMenuRow(i, { price: e.target.value })}
                    inputMode="decimal"
                  />
                  <label className="flex items-center gap-1 text-zinc-500">
                    <input
                      type="checkbox"
                      checked={row.available}
                      onChange={(e) => updateMenuRow(i, { available: e.target.checked })}
                    />
                    avail
                  </label>
                  <input
                    placeholder="Description"
                    className="rounded border border-zinc-700 bg-black/30 px-2 py-1 sm:col-span-3"
                    value={row.description}
                    onChange={(e) => updateMenuRow(i, { description: e.target.value })}
                  />
                  <input
                    placeholder="Photo URL"
                    className="rounded border border-zinc-700 bg-black/30 px-2 py-1 sm:col-span-2"
                    value={row.photoUrl}
                    onChange={(e) => updateMenuRow(i, { photoUrl: e.target.value })}
                  />
                  <input
                    placeholder="Calories (opt)"
                    className="rounded border border-zinc-700 bg-black/30 px-2 py-1"
                    value={row.calories}
                    onChange={(e) => updateMenuRow(i, { calories: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          {err ? <p className="text-sm text-red-400">{err}</p> : null}
          {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-black disabled:opacity-50"
            style={{ background: "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)" }}
          >
            {busy ? "Saving…" : "Save restaurant + menu"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
