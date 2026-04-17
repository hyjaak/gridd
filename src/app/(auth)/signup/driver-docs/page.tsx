"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  doc,
  getFirestore,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { sendEmailVerification } from "firebase/auth";
import app, { storage } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { DRIVER_SERVICE_META } from "@/lib/driver-service-meta";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { ProviderDocuments } from "@/types";

const SERVICE_IDS = Object.keys(DRIVER_SERVICE_META);
const YEARS = Array.from({ length: 2027 - 1985 }, (_, i) => String(2026 - i));

/** Expiry YYYY-MM-DD must be on or after today (not expired). */
function isOnOrAfterToday(ymd: string): boolean {
  const parts = ymd.trim().split("-");
  if (parts.length !== 3) return false;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const day = Number(parts[2]);
  if (!y || !m || !day) return false;
  const expiry = new Date(y, m - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return expiry.getTime() >= today.getTime();
}

async function uploadFile(file: File, path: string) {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export default function DriverDocsPage() {
  const router = useRouter();
  const { user, role, loading } = useAuth();
  const db = getFirestore(app);

  const [licenseFront, setLicenseFront] = useState<File | null>(null);
  const [licenseBack, setLicenseBack] = useState<File | null>(null);
  const [insuranceCard, setInsuranceCard] = useState<File | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);

  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [licenseState, setLicenseState] = useState("");

  const [vehicleYear, setVehicleYear] = useState("2021");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [plateState, setPlateState] = useState("");

  const [insuranceProvider, setInsuranceProvider] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [insuranceExpiry, setInsuranceExpiry] = useState("");

  const [serviceZip, setServiceZip] = useState("");
  const [maxMiles, setMaxMiles] = useState("25");
  const [serviceIds, setServiceIds] = useState<Set<string>>(() => new Set(SERVICE_IDS));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (role && role !== "driver") {
      router.replace("/home");
    }
  }, [user, role, loading, router]);

  function toggleService(id: string) {
    setServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    if (!licenseNumber.trim()) {
      setError("Please enter your driver's license number.");
      return;
    }
    if (!licenseExpiry.trim()) {
      setError("Please enter your license expiration date.");
      return;
    }
    if (!isOnOrAfterToday(licenseExpiry)) {
      setError("License expiration must be today or a future date (not expired).");
      return;
    }
    if (!licenseState.trim()) {
      setError("Please enter the state your license was issued in.");
      return;
    }

    if (!vehicleYear.trim()) {
      setError("Please select your vehicle year.");
      return;
    }
    if (!vehicleMake.trim()) {
      setError("Please enter your vehicle make.");
      return;
    }
    if (!vehicleModel.trim()) {
      setError("Please enter your vehicle model.");
      return;
    }
    if (!licensePlate.trim()) {
      setError("Please enter your license plate number.");
      return;
    }

    if (!insuranceProvider.trim()) {
      setError("Please enter your insurance provider name.");
      return;
    }
    if (!insuranceExpiry.trim()) {
      setError("Please enter your insurance policy expiration date.");
      return;
    }
    if (!isOnOrAfterToday(insuranceExpiry)) {
      setError("Insurance expiration must be today or a future date (policy not expired).");
      return;
    }

    if (serviceIds.size === 0) {
      setError("Please select at least one service you offer.");
      return;
    }

    if (!serviceZip.trim()) {
      setError("Please enter your service area ZIP code.");
      return;
    }

    if (!licenseFront || !licenseBack || !insuranceCard || !profilePhoto) {
      setError("Please upload license front, license back, insurance card, and profile photos.");
      return;
    }

    setSubmitting(true);
    try {
      const uid = user.uid;
      const ext = (f: File) => (f.name.split(".").pop() || "jpg").slice(0, 8);
      const [lf, lb, ins, ph] = await Promise.all([
        uploadFile(licenseFront, `drivers/${uid}/license_front.${ext(licenseFront)}`),
        uploadFile(licenseBack, `drivers/${uid}/license_back.${ext(licenseBack)}`),
        uploadFile(insuranceCard, `drivers/${uid}/insurance.${ext(insuranceCard)}`),
        uploadFile(profilePhoto, `drivers/${uid}/profile.${ext(profilePhoto)}`),
      ]);

      const documents: ProviderDocuments = {
        licenseFront: lf,
        licenseBack: lb,
        insurance: ins,
        profilePhoto: ph,
        licenseNumber: licenseNumber.trim(),
        licenseExpiry,
        licenseState: licenseState.trim(),
        vehicleYear,
        vehicleMake: vehicleMake.trim(),
        vehicleModel: vehicleModel.trim(),
        vehicleColor: vehicleColor.trim(),
        licensePlate: licensePlate.trim().toUpperCase(),
        plateState: plateState.trim(),
        insuranceProvider: insuranceProvider.trim(),
        policyNumber: policyNumber.trim() || undefined,
        insuranceExpiry,
        serviceZip: serviceZip.trim(),
        maxDistanceMiles: Math.min(200, Math.max(5, parseInt(maxMiles, 10) || 25)),
        serviceIds: Array.from(serviceIds),
      };

      await updateDoc(doc(db, "providers", uid), {
        documents,
        verificationStatus: "pending",
        submittedAt: serverTimestamp(),
        photoUrl: ph,
        zip: serviceZip.trim(),
        serviceIds: documents.serviceIds,
      });

      await sendEmailVerification(user, {
        url: "https://gridd.click/login",
        handleCodeInApp: false,
      });

      try {
        await fetch("/api/email/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, name: user.displayName }),
        });
      } catch {
        /* optional */
      }

      const token = await user.getIdToken();
      await fetch("/api/drivers/notify-application", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => null);

      router.push(`/signup/application-submitted?email=${encodeURIComponent(user.email ?? "")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-full items-center justify-center bg-[#060606] px-6 py-20 text-zinc-500">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 pb-24 pt-16" style={{ background: "#060606", color: "#eee" }}>
      <p className="text-xs font-semibold uppercase tracking-widest text-[#00FF88]">Step 2 — Driver documents</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Verify your identity</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Before you can accept jobs, we need to verify your identity and vehicle.
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-10">
        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">🪪 Driver&apos;s License</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              Front photo
              <input
                type="file"
                accept="image/*"
                className="mt-1 w-full text-sm"
                onChange={(e) => setLicenseFront(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Back photo
              <input
                type="file"
                accept="image/*"
                className="mt-1 w-full text-sm"
                onChange={(e) => setLicenseBack(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-zinc-500">License number</label>
              <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Expiry</label>
              <Input type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-zinc-500">State issued</label>
              <Input value={licenseState} onChange={(e) => setLicenseState(e.target.value)} placeholder="GA" required />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">🚗 Vehicle</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-zinc-500">Year</label>
              <select
                value={vehicleYear}
                onChange={(e) => setVehicleYear(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-black/50 px-3 py-2 text-sm"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500">Make</label>
              <Input value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} placeholder="Ford" required />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Model</label>
              <Input value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="F-150" required />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Color</label>
              <Input value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} placeholder="White" />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Plate</label>
              <Input value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Plate state</label>
              <Input value={plateState} onChange={(e) => setPlateState(e.target.value)} placeholder="GA" />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">🛡️ Insurance</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-zinc-500">Provider</label>
              <Input value={insuranceProvider} onChange={(e) => setInsuranceProvider(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Policy #</label>
              <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Policy expiry</label>
              <Input type="date" value={insuranceExpiry} onChange={(e) => setInsuranceExpiry(e.target.value)} required />
            </div>
            <label className="block text-xs text-zinc-500">
              Insurance card photo
              <input
                type="file"
                accept="image/*"
                className="mt-1 w-full text-sm"
                onChange={(e) => setInsuranceCard(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">📸 Profile photo</h2>
          <label className="mt-2 block text-xs text-zinc-500">
            Clear photo of you (customers will recognize you)
            <input
              type="file"
              accept="image/*"
              className="mt-1 w-full text-sm"
              onChange={(e) => setProfilePhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        </section>

        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">Service area & offers</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-zinc-500">ZIP code</label>
              <Input value={serviceZip} onChange={(e) => setServiceZip(e.target.value)} placeholder="30058" required />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Max distance (miles)</label>
              <Input type="number" min={5} max={200} value={maxMiles} onChange={(e) => setMaxMiles(e.target.value)} />
            </div>
          </div>
          <p className="mt-4 text-xs text-zinc-500">Services you offer</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SERVICE_IDS.map((id) => {
              const m = DRIVER_SERVICE_META[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleService(id)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    serviceIds.has(id) ? "border-[#00FF88] bg-[#00FF88]/15 text-[#00FF88]" : "border-zinc-700 text-zinc-500",
                  ].join(" ")}
                >
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
        </section>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <Button type="submit" disabled={submitting} className="w-full py-6 text-base font-bold">
          {submitting ? "Uploading…" : "Submit for Review"}
        </Button>
      </form>

      <p className="mt-8 text-center text-xs text-zinc-600">
        Step 3 — You&apos;ll verify your email next. Questions?{" "}
        <a href="mailto:drivers@gridd.click" className="text-[#00FF88]">
          drivers@gridd.click
        </a>
      </p>
    </main>
  );
}
