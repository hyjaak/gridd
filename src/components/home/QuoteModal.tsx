"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SERVICES, PHONE, PHONE_HREF, MARKETS } from "@/lib/constants";
import type { MarketKey, ServiceId } from "@/lib/constants";
import { submitBooking, type StopAddress } from "./booking";
import { fireConfetti } from "./confetti";
import StopAddressInput from "./StopAddressInput";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

type Props = {
  open: boolean;
  onClose: () => void;
  market: MarketKey;
};

const TIME_WINDOWS = [
  "ASAP today",
  "This afternoon",
  "Tomorrow AM",
  "Tomorrow PM",
  "Flexible",
];

export default function QuoteModal({ open, onClose, market }: Props) {
  const [svc, setSvc] = useState<ServiceId>("delivery");
  const [pickupAddress, setPickupAddress] = useState<StopAddress>({ city: "" });
  const [dropoffAddress, setDropoffAddress] = useState<StopAddress>({ city: "" });
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [desc, setDesc] = useState("");
  const [timeWindow, setTimeWindow] = useState("");
  const [itemPhotoUrl, setItemPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSvc("delivery");
      setPickupAddress({ city: "" });
      setDropoffAddress({ city: "" });
      setPhone("");
      setContactName("");
      setDesc("");
      setTimeWindow("");
      setItemPhotoUrl("");
      setDone(false);
      setError(null);
    }
  }, [open]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

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

  const handleSubmit = useCallback(async () => {
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
      });
      setDone(true);
      fireConfetti(24);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Something went wrong. Try texting us at ${PHONE} or call.`
      );
    } finally {
      setSubmitting(false);
    }
  }, [svc, pickupAddress, dropoffAddress, phone, contactName, desc, timeWindow, itemPhotoUrl, market]);

  return (
    <div
      className={`fixed inset-0 z-60 flex items-end sm:items-center justify-center ${
        open ? "" : "hidden"
      }`}
      style={{ background: open ? "rgba(16,22,19,.45)" : "transparent" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full max-w-[480px] bg-white rounded-[26px_26px_0_0] sm:rounded-[26px] px-[22px] pb-[26px] max-h-[88vh] overflow-y-auto transition-all duration-500 ${
          open
            ? "translate-y-0 sm:translate-y-0 sm:scale-100 sm:opacity-100"
            : "translate-y-[105%] sm:translate-y-[30px] sm:scale-[.96] sm:opacity-0"
        }`}
        style={{
          transitionTimingFunction: "cubic-bezier(.2,.9,.25,1.08)",
        }}
      >
        {/* Header road strip */}
        <div className="relative h-11 -mx-[22px] mb-1.5 bg-[#101613] rounded-[26px_26px_0_0] sm:rounded-[26px_26px_0_0] overflow-hidden">
          <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-[repeating-linear-gradient(90deg,#7cc7a8_0_14px,transparent_14px_26px)] opacity-70" />
          <span className="absolute top-1/2 -translate-y-[58%] text-[20px] animate-[qdrive_2.8s_linear_infinite]">🚚</span>
          <button
            onClick={onClose}
            className="absolute top-[9px] right-[14px] z-[2] border-none bg-white/15 text-white w-[26px] h-[26px] rounded-full font-extrabold cursor-pointer text-[13px] flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {!done ? (
          <>
            <span className="inline-block bg-[#0e9f6e] text-white font-[800] font-bricolage text-[10.5px] tracking-[2px] px-3 py-1.5 rounded-lg -rotate-2 mt-3.5 mb-2">
              DISPATCH TICKET
            </span>
            <h3 className="font-[800] font-bricolage text-[26px] tracking-tight leading-tight mb-0.5">
              Let's price your run.
            </h3>
            <p className="text-[13px] text-[#5c6a62] mb-3.5">
              30 seconds. Flat number texted back — usually within the hour.
            </p>

            {/* Service picker */}
            <div className="grid grid-cols-3 gap-[9px] mb-[18px]">
              {SERVICES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSvc(s.id)}
                  className={`border-2 rounded-2xl p-3 text-left font-inherit cursor-pointer flex flex-col gap-[3px] transition-colors ${
                    svc === s.id
                      ? "border-[#0e9f6e] bg-[#f2faf6] shadow-[0_8px_20px_rgba(14,159,110,.14)]"
                      : "border-black/12 bg-white"
                  }`}
                >
                <b className="text-[14.5px]">{s.label}</b>
                  <span className="text-[11.5px] text-[#5c6a62] leading-tight hidden sm:inline">{s.blurb}</span>
                  <em className="not-italic text-[12.5px] font-extrabold text-[#0e9f6e] mt-[3px]">
                    from ${s.from}
                  </em>
                </button>
              ))}
            </div>

            {/* Form */}
            <div className="flex flex-col gap-2">
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
                />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Your phone"
                className="border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white focus:outline-none focus:border-[#0e9f6e]"
              />
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Your name (optional)"
                className="border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white focus:outline-none focus:border-[#0e9f6e]"
              />
              {/* Time window chips */}
              <div className="flex flex-wrap gap-2">
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
              <div>
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
                    className="mt-2 w-16 h-16 object-cover rounded-lg border border-black/10"
                  />
                )}
              </div>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="The job — what, from where, to where?"
                rows={2}
                className="border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white resize-vertical min-h-[70px] focus:outline-none focus:border-[#0e9f6e]"
              />
              {error && <p className="text-[13px] text-red-500">{error}</p>}
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="w-full bg-[#0e9f6e] text-white font-bold text-[16px] py-3.5 rounded-full mt-1 shadow-[0_12px_26px_rgba(14,159,110,.32)] hover:bg-[#0a7a54] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer border-none text-center"
              >
                {submitting ? "Sending..." : "Get my flat price"}
              </button>
              <div className="text-center mt-1 text-[13px] text-[#5c6a62]">
                or call / text{" "}
                <a href={PHONE_HREF} className="text-[#0e9f6e] font-extrabold no-underline">
                  {PHONE}
                </a>
              </div>
              <p className="text-center text-[12px] text-[#5c6a62] font-bold">
                We reply within the hour, Mon–Sat.
              </p>
            </div>
          </>
        ) : (
          /* Success state */
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-[#0e9f6e] text-white text-[26px] font-extrabold flex items-center justify-center mx-auto mb-4">
              ✓
            </div>
            <h3 className="font-[800] font-bricolage text-[28px] tracking-tight leading-tight mb-1.5">
              Got it.
            </h3>
            <p className="text-[13px] text-[#5c6a62]">
              Flat price within the hour. The text comes from <b>{PHONE}</b> — save the number, that thread is your receipt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}