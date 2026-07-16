"use client";

import { useState, useEffect, useRef } from "react";
import { PHONE, PHONE_HREF, SERVICES, MARKETS } from "@/lib/constants";
import type { MarketKey, ServiceId } from "@/lib/constants";
import type { AddressSuggestion } from "@/lib/dispatch-geo";
import { drivingMiles } from "@/lib/dispatch-geo";
import { suggestPrice, loadDispatchRates, type DispatchPriceRates } from "@/lib/dispatch-pricing";
import { submitBooking, type StopAddress } from "./booking";
import TrustStrip from "./TrustStrip";
import FitGuide from "./FitGuide";
import StopAddressInput from "./StopAddressInput";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

type Props = {
  market: MarketKey;
};

const TIME_WINDOWS = [
  "ASAP today",
  "This afternoon",
  "Tomorrow AM",
  "Tomorrow PM",
  "Flexible",
];

export default function BookingSection({ market }: Props) {
  const [svc, setSvc] = useState<ServiceId>("delivery");
  const [pickupAddress, setPickupAddress] = useState<StopAddress>({ city: "" });
  const [dropoffAddress, setDropoffAddress] = useState<StopAddress>({ city: "" });
  const [pickupGeo, setPickupGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffGeo, setDropoffGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [desc, setDesc] = useState("");
  const [timeWindow, setTimeWindow] = useState("");
  const [itemPhoto, setItemPhoto] = useState<File | null>(null);
  const [itemPhotoUrl, setItemPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estPrice, setEstPrice] = useState<{ price: number; miles: number } | null>(null);
  const [rates, setRates] = useState<DispatchPriceRates | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load pricing rates once
  useEffect(() => {
    loadDispatchRates().then(setRates).catch(() => {});
  }, []);

  // When both coords are set, compute estimate
  useEffect(() => {
    if (!pickupGeo || !dropoffGeo || !rates) {
      setEstPrice(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const miles = await drivingMiles(pickupGeo, dropoffGeo);
      if (cancelled) return;
      const est = suggestPrice(svc, miles, 0, rates);
      setEstPrice(est);
    })();
    return () => { cancelled = true; };
  }, [pickupGeo, dropoffGeo, svc, rates]);

  const handlePhotoUpload = async (file: File) => {
    setUploading(true);
    try {
      const storageRef = ref(storage, `jobPhotos/${Date.now()}.jpg`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setItemPhotoUrl(url);
    } catch (err) {
      setError("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await submitBooking({
        jobType: svc,
        pickupAddress,
        dropoffAddress,
        customerPhone: phone,
        contactName,
        description: desc,
        timeWindow,
        itemPhotoUrl,
        market,
        estMiles: estPrice?.miles,
        estPrice: estPrice?.price,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Something went wrong. Try texting us at ${PHONE} or call.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-5">
        <div className="w-14 h-14 rounded-full bg-[#0e9f6e] text-white text-[26px] font-extrabold flex items-center justify-center mx-auto mb-4">
          ✓
        </div>
        <h3 className="text-[28px] font-[800] font-bricolage tracking-tight leading-tight mb-1.5 text-[#101613]">
          Got it.
        </h3>
        <p className="text-[15px] text-[#5c6a62] mb-2">
          You'll have a flat price within the hour — watch your texts.
        </p>
        <p className="text-[13px] text-[#5c6a62]">
          The text comes from <b>{PHONE}</b> — save the number, that thread is your receipt and tracker.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[9px] my-[18px]">
        {SERVICES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSvc(s.id)}
            className={`border-2 rounded-2xl p-3.5 text-left font-inherit cursor-pointer flex flex-col gap-[3px] transition-colors ${
              svc === s.id
                ? "border-[#0e9f6e] bg-[#f2faf6] shadow-[0_8px_20px_rgba(14,159,110,.14)]"
                : "border-black/12 bg-white"
            }`}
          >
            <b className="text-[14.5px]">{s.label}</b>
            <span className="text-[11.5px] text-[#5c6a62]">{s.blurb}</span>
            <em className="not-italic text-[12.5px] font-extrabold text-[#0e9f6e] mt-[3px]">
              from ${s.from}
            </em>
            <span className="text-[10.5px] text-[#5c6a62] leading-tight mt-1">
              {s.examples.join(" · ")}
            </span>
          </button>
        ))}
      </div>
      <FitGuide />
      <TrustStrip />
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="flex gap-2">
          <StopAddressInput
            label="Pickup"
            street={pickupAddress.street || ""}
            city={pickupAddress.city}
            unit={pickupAddress.unit || ""}
            notes={pickupAddress.notes || ""}
            onStreetChange={(val) => setPickupAddress({ ...pickupAddress, street: val })}
            onCityChange={(val) => setPickupAddress({ ...pickupAddress, city: val })}
            onUnitChange={(val) => setPickupAddress({ ...pickupAddress, unit: val })}
            onNotesChange={(val) => setPickupAddress({ ...pickupAddress, notes: val })}
            market={market}
            onGeoSelect={(geo) => setPickupGeo(geo)}
          />
          <StopAddressInput
            label="Drop-off"
            street={dropoffAddress.street || ""}
            city={dropoffAddress.city}
            unit={dropoffAddress.unit || ""}
            notes={dropoffAddress.notes || ""}
            onStreetChange={(val) => setDropoffAddress({ ...dropoffAddress, street: val })}
            onCityChange={(val) => setDropoffAddress({ ...dropoffAddress, city: val })}
            onUnitChange={(val) => setDropoffAddress({ ...dropoffAddress, unit: val })}
            onNotesChange={(val) => setDropoffAddress({ ...dropoffAddress, notes: val })}
            market={market}
            onGeoSelect={(geo) => setDropoffGeo(geo)}
          />
        </div>
        {/* Estimate line */}
        {estPrice && estPrice.miles <= 60 && (
          <div className="text-[12.5px] text-[#0e9f6e] font-bold text-center -mt-1 mb-2 bg-[#f2faf6] border border-[#0e9f6e]/20 rounded-xl px-3 py-2">
            Estimated flat price: ~${estPrice.price} · {estPrice.miles} miles — final number confirmed by text.
          </div>
        )}
        {estPrice && estPrice.miles > 60 && (
          <div className="text-[12.5px] text-[#5c6a62] font-bold text-center -mt-1 mb-2 bg-[#f2faf6] border border-[#0e9f6e]/20 rounded-xl px-3 py-2">
            Long run — we'll confirm your flat price by text.
          </div>
        )}
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Your phone"
          className="border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 focus:outline-none focus:border-[#0e9f6e]"
        />
        <input
          type="text"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Your name (optional)"
          className="border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 focus:outline-none focus:border-[#0e9f6e]"
        />
        {/* Time window chips */}
        <div className="flex flex-wrap gap-2 mb-2">
          {TIME_WINDOWS.map((tw: string) => (
            <button
              key={tw}
              type="button"
              onClick={() => setTimeWindow(timeWindow === tw ? "" : tw)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
                timeWindow === tw
                  ? "bg-[#0e9f6e] text-white border-[#0e9f6e]"
                  : "bg-white text-[#5c6a62] border-black/12 hover:border-[#0e9f6e]"
              }`}
            >
              {tw}
            </button>
          ))}
        </div>
        {/* Item photo upload */}
        <div className="mb-2">
          <label className="text-[12px] font-bold text-[#5c6a62] mb-1 block">
            Snap the item — fastest way to an exact price (optional)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setItemPhoto(file);
                handlePhotoUpload(file);
              }
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full border-[1.5px] border-dashed border-black/20 rounded-xl px-3 py-3 text-[13px] text-[#5c6a62] hover:border-[#0e9f6e] hover:text-[#0e9f6e] transition-colors disabled:opacity-50"
          >
            {uploading ? "Uploading..." : itemPhotoUrl ? "Photo attached ✓" : "+ Add photo"}
          </button>
          {itemPhotoUrl && (
            <img
              src={itemPhotoUrl}
              alt="Item preview"
              className="mt-2 w-20 h-20 object-cover rounded-lg border border-black/10"
            />
          )}
        </div>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="The job — what, from where, to where?"
          rows={2}
          className="border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 resize-vertical min-h-[70px] focus:outline-none focus:border-[#0e9f6e]"
        />
        {error && <p className="text-[13px] text-red-500 mb-2">{error}</p>}
        <p className="text-[12px] text-[#5c6a62] text-center -mt-1 mb-2">
          We reply within the hour, Mon–Sat.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#0e9f6e] text-white font-bold text-[16px] py-3.5 rounded-full mt-1 shadow-[0_12px_26px_rgba(14,159,110,.32)] hover:bg-[#0a7a54] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer border-none text-center"
        >
          {submitting ? "Sending..." : "Get my flat price"}
        </button>
        <div className="text-center mt-3 text-[13px] text-[#5c6a62]">
          or call / text{" "}
          <a href={PHONE_HREF} className="text-[#0e9f6e] font-extrabold no-underline">
            {PHONE}
          </a>
        </div>
      </form>
      {/* B2B strip */}
      <div className="mt-4 pt-4 border-t border-black/8 text-center">
        <p className="text-[12.5px] text-[#5c6a62] leading-relaxed">
          Run a shop or a crew? Weekly accounts + invoice billing — text{' '}
          <strong className="text-[#101613]">'BIZ'</strong> to{' '}
          <a href={PHONE_HREF} className="text-[#0e9f6e] font-bold no-underline">
            {PHONE}
          </a>
        </p>
      </div>
    </div>
  );
}