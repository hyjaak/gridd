"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  deleteField,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { sendEmailVerification, signOut } from "firebase/auth";
import app, { firebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { DRIVER_SERVICE_META } from "@/lib/driver-service-meta";
import { Input } from "@/components/ui/Input";
import type { ProviderDocuments } from "@/types";
import { getDriverAccess } from "@/lib/driver-gate";
import type { Provider } from "@/types";
import { validateDocumentFile } from "@/lib/upload-validation";
import {
  mapUploadFailureToMessage,
  UPLOAD_STUCK_AT_ZERO,
  uploadDriverDocument,
  uploadDriverDocumentsSequential,
} from "@/lib/driver-doc-upload";

const SERVICE_IDS = Object.keys(DRIVER_SERVICE_META);
const YEARS = Array.from({ length: 2027 - 1985 }, (_, i) => String(2026 - i));

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

function extForFile(f: File): string {
  const n = f.name.toLowerCase();
  if (f.type === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  const e = (f.name.split(".").pop() || "jpg").slice(0, 8);
  return e.replace(/[^a-z0-9]/gi, "") || "jpg";
}

function formatSubmitError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (m === UPLOAD_STUCK_AT_ZERO) {
      return "Upload failed — check connection";
    }
    if (m === "File too large (max 15MB)" || m.includes("File too large")) {
      return "File too large (max 15MB)";
    }
    if (m.includes("Upload a photo") || m.includes("PDF")) return m;
  }
  return mapUploadFailureToMessage(err);
}

/** Per-field validation keys — clear individually as the user fixes each field */
type FieldErrorKey =
  | "profile_name"
  | "profile_phone"
  | "profile_photo"
  | "license_front"
  | "license_back"
  | "insurance_card"
  | "commercial_auto"
  | "commercial_expiry"
  | "registration"
  | "vehicle_photos"
  | "selfie"
  | "background_consent"
  | "license_number"
  | "license_expiry"
  | "license_state"
  | "vehicle_fields"
  | "insurance_provider"
  | "insurance_expiry"
  | "registration_expiry"
  | "service_zip"
  | "services"
  | "commercial_ack"
  | "general";

type FieldErrors = Partial<Record<FieldErrorKey, string>>;

const EMPTY_ERRORS: FieldErrors = {};

/** DOM scroll / highlight order (top → bottom, matches form layout) */
const FORM_FIELD_ORDER: FieldErrorKey[] = [
  "profile_name",
  "profile_phone",
  "profile_photo",
  "license_front",
  "license_back",
  "license_number",
  "license_expiry",
  "license_state",
  "insurance_provider",
  "insurance_expiry",
  "insurance_card",
  "commercial_expiry",
  "commercial_auto",
  "registration",
  "registration_expiry",
  "vehicle_photos",
  "vehicle_fields",
  "selfie",
  "background_consent",
  "commercial_ack",
  "services",
  "service_zip",
  "general",
];

function zipDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 9);
}

function isValidUsZipDigits(digits: string): boolean {
  return digits.length === 5 || digits.length === 9;
}

function formatZipForStorage(raw: string): string {
  const d = zipDigitsOnly(raw);
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return d;
}

function dateStrToTimestampEndOfDay(ymd: string): Timestamp | null {
  const t = ymd.trim();
  if (!t) return null;
  const d = new Date(`${t}T23:59:59`);
  if (!Number.isFinite(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

function FieldHighlight({
  fieldKey,
  highlightKey,
  message,
  children,
  className,
}: {
  fieldKey: FieldErrorKey;
  highlightKey: FieldErrorKey | null;
  message?: string;
  children: ReactNode;
  className?: string;
}) {
  const active = highlightKey === fieldKey && Boolean(message);
  return (
    <div
      id={`driver-field-${fieldKey}`}
      className={[
        className,
        active ? "scroll-mt-24 rounded-xl ring-2 ring-red-500 ring-offset-2 ring-offset-[#060606]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {active ? (
        <p role="alert" className="mb-2 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          Please complete this field to continue
        </p>
      ) : null}
      {children}
    </div>
  );
}

export default function DriverDocsPage() {
  const router = useRouter();
  const { user, role, loading } = useAuth();
  const db = getFirestore(app);

  const [licenseFront, setLicenseFront] = useState<File | null>(null);
  const [licenseBack, setLicenseBack] = useState<File | null>(null);
  const [insuranceCard, setInsuranceCard] = useState<File | null>(null);
  const [commercialAuto, setCommercialAuto] = useState<File | null>(null);
  const [registration, setRegistration] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [backgroundConsent, setBackgroundConsent] = useState<File | null>(null);

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
  const [commercialAutoExpiry, setCommercialAutoExpiry] = useState("");
  const [registrationExpiry, setRegistrationExpiry] = useState("");
  const [confirmCommercialInsurance, setConfirmCommercialInsurance] = useState(false);

  const [serviceZip, setServiceZip] = useState("");
  const [maxMiles, setMaxMiles] = useState("25");
  const [serviceIds, setServiceIds] = useState<Set<string>>(() => new Set(SERVICE_IDS));

  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>(EMPTY_ERRORS);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  /** First invalid field after a failed submit — scroll + ring highlight */
  const [highlightKey, setHighlightKey] = useState<FieldErrorKey | null>(null);

  /** Steps 2–7: profile → docs → vehicle → services → area → submit */
  const [wizardStep, setWizardStep] = useState(2);
  const [legalFullName, setLegalFullName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [profileHeadshot, setProfileHeadshot] = useState<File | null>(null);
  const [existingProfilePhotoUrl, setExistingProfilePhotoUrl] = useState<string | null>(null);
  const [vehicleImgFront, setVehicleImgFront] = useState<File | null>(null);
  const [vehicleImgRear, setVehicleImgRear] = useState<File | null>(null);
  const [vehicleImgDriver, setVehicleImgDriver] = useState<File | null>(null);
  const [vehicleImgPassenger, setVehicleImgPassenger] = useState<File | null>(null);

  const categoriesDone = useMemo(() => {
    let n = 0;
    if (licenseFront && licenseBack) n += 1;
    if (insuranceCard) n += 1;
    if (commercialAuto) n += 1;
    if (registration) n += 1;
    if (selfie) n += 1;
    if (backgroundConsent) n += 1;
    return n;
  }, [licenseFront, licenseBack, insuranceCard, commercialAuto, registration, selfie, backgroundConsent]);

  const remainingErrorMessages = useMemo(
    () =>
      (Object.entries(errors) as [FieldErrorKey, string | undefined][])
        .filter(([, v]) => Boolean(v))
        .map(([, v]) => v as string),
    [errors],
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/?modal=login");
      return;
    }
    if (role && role !== "driver") {
      router.replace("/home");
    }
  }, [user, role, loading, router]);

  /** Approved drivers skip; legacy demo (flow v1) still shortcuts here. v2+ demo cannot go online — stays in funnel until CEO approval. */
  useEffect(() => {
    if (!user?.uid) return;
    const firestore = getFirestore(app);
    const pref = doc(firestore, "providers", user.uid);
    const unsub = onSnapshot(pref, (snap) => {
      if (!snap.exists()) return;
      const p = { uid: snap.id, ...(snap.data() as Omit<Provider, "uid">) };
      const access = getDriverAccess(p);
      if (access === "approved") {
        router.replace("/driver/jobs");
        return;
      }
      if (access === "demo" && (p.driverFlowVersion ?? 1) < 2) {
        router.replace("/driver/jobs");
        return;
      }
      const ws = p.driverWizardStep;
      if (typeof ws === "number" && ws >= 2 && ws <= 7) setWizardStep(ws);
      if (typeof p.phone === "string" && p.phone.trim()) setDriverPhone((prev) => prev.trim() || p.phone!.trim());
      setLegalFullName((prev) => (prev.trim() ? prev : p.name ?? ""));
      const docs = p.documents as ProviderDocuments | undefined;
      const shot = docs?.profilePhoto ?? (typeof p.photoUrl === "string" ? p.photoUrl : null);
      if (shot) setExistingProfilePhotoUrl(shot);
    });
    return () => unsub();
  }, [user?.uid, router]);

  useEffect(() => {
    const dn = user?.displayName?.trim();
    if (dn && !legalFullName.trim()) setLegalFullName(dn);
  }, [user?.displayName, legalFullName]);

  function toggleService(id: string) {
    setServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size > 0) {
        setErrors((e) => {
          if (!e.services) return e;
          const copy = { ...e };
          delete copy.services;
          return copy;
        });
      }
      return next;
    });
  }

  const clearErrorKey = useCallback((key: FieldErrorKey) => {
    setErrors((prev) => {
      if (prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  function handleFileField(key: FieldErrorKey, file: File | null, setter: (f: File | null) => void) {
    setter(file);
    if (!file) {
      clearErrorKey(key);
      return;
    }
    const bad = validateDocumentFile(file);
    if (bad) {
      setErrors((prev) => ({ ...prev, [key]: bad }));
    } else {
      clearErrorKey(key);
    }
  }

  useEffect(() => {
    if (licenseNumber.trim()) clearErrorKey("license_number");
  }, [licenseNumber, clearErrorKey]);

  useEffect(() => {
    if (licenseExpiry.trim() && isOnOrAfterToday(licenseExpiry)) clearErrorKey("license_expiry");
  }, [licenseExpiry, clearErrorKey]);

  useEffect(() => {
    if (licenseState.trim()) clearErrorKey("license_state");
  }, [licenseState, clearErrorKey]);

  useEffect(() => {
    if (
      vehicleYear.trim() &&
      vehicleMake.trim() &&
      vehicleModel.trim() &&
      licensePlate.trim()
    ) {
      clearErrorKey("vehicle_fields");
    }
  }, [vehicleYear, vehicleMake, vehicleModel, licensePlate, clearErrorKey]);

  useEffect(() => {
    if (insuranceProvider.trim()) clearErrorKey("insurance_provider");
  }, [insuranceProvider, clearErrorKey]);

  useEffect(() => {
    if (insuranceExpiry.trim() && isOnOrAfterToday(insuranceExpiry)) clearErrorKey("insurance_expiry");
  }, [insuranceExpiry, clearErrorKey]);

  useEffect(() => {
    if (commercialAutoExpiry.trim() && isOnOrAfterToday(commercialAutoExpiry)) clearErrorKey("commercial_expiry");
  }, [commercialAutoExpiry, clearErrorKey]);

  useEffect(() => {
    if (registrationExpiry.trim() && isOnOrAfterToday(registrationExpiry)) clearErrorKey("registration_expiry");
  }, [registrationExpiry, clearErrorKey]);

  useEffect(() => {
    if (confirmCommercialInsurance) clearErrorKey("commercial_ack");
  }, [confirmCommercialInsurance, clearErrorKey]);

  useEffect(() => {
    const z = zipDigitsOnly(serviceZip);
    if (isValidUsZipDigits(z)) clearErrorKey("service_zip");
  }, [serviceZip, clearErrorKey]);

  useEffect(() => {
    if (highlightKey && !errors[highlightKey]) setHighlightKey(null);
  }, [errors, highlightKey]);

  async function persistWizardStep(step: number, extras?: Record<string, unknown>) {
    if (!user) return;
    const clamped = Math.min(7, Math.max(2, step));
    setWizardStep(clamped);
    await updateDoc(doc(db, "providers", user.uid), { driverWizardStep: clamped, ...(extras ?? {}) });
  }

  function validateWizardStep(step: number): FieldErrors {
    const e: FieldErrors = {};
    if (step === 2) {
      if (!legalFullName.trim()) e.profile_name = "Enter your full legal name.";
      const pd = driverPhone.replace(/\D/g, "");
      if (pd.length < 10) e.profile_phone = "Enter a valid phone number (10+ digits).";
      if (!profileHeadshot && !existingProfilePhotoUrl) e.profile_photo = "Upload a profile photo.";
      return e;
    }
    if (step === 3) {
      if (!licenseFront) e.license_front = "Please upload: Driver license (front).";
      if (!licenseBack) e.license_back = "Please upload: Driver license (back).";
      if (!insuranceCard) e.insurance_card = "Please upload: Personal auto insurance.";
      if (!commercialAuto) e.commercial_auto = "Please upload: Commercial auto proof (declarations page).";
      if (!commercialAutoExpiry.trim()) e.commercial_expiry = "Enter commercial coverage expiration date.";
      else if (!isOnOrAfterToday(commercialAutoExpiry)) {
        e.commercial_expiry = "Commercial coverage must be current (not expired).";
      }
      if (!registration) e.registration = "Please upload: Vehicle registration.";
      if (!registrationExpiry.trim()) e.registration_expiry = "Enter vehicle registration expiration date.";
      else if (!isOnOrAfterToday(registrationExpiry)) {
        e.registration_expiry = "Vehicle registration must be current (not expired).";
      }
      if (!selfie) e.selfie = "Please upload: Live selfie / verification.";
      if (!backgroundConsent) e.background_consent = "Please upload: Background check consent.";
      if (!licenseNumber.trim()) e.license_number = "Please enter your driver's license number.";
      if (!licenseExpiry.trim()) e.license_expiry = "Enter license expiration date.";
      else if (!isOnOrAfterToday(licenseExpiry)) {
        e.license_expiry = "License expiration must be a valid future date.";
      }
      if (!licenseState.trim()) e.license_state = "Please enter the state your license was issued in.";
      if (!insuranceProvider.trim()) e.insurance_provider = "Enter your insurance provider.";
      if (!insuranceExpiry.trim()) e.insurance_expiry = "Enter policy expiration date.";
      else if (!isOnOrAfterToday(insuranceExpiry)) e.insurance_expiry = "Insurance policy must be current (not expired).";
      return e;
    }
    if (step === 4) {
      if (!vehicleYear.trim() || !vehicleMake.trim() || !vehicleModel.trim() || !licensePlate.trim()) {
        e.vehicle_fields = "Please complete all required vehicle fields (year, make, model, plate).";
      }
      if (!vehicleImgFront || !vehicleImgRear || !vehicleImgDriver || !vehicleImgPassenger) {
        e.vehicle_photos = "Upload all four vehicle angle photos.";
      } else {
        for (const f of [vehicleImgFront, vehicleImgRear, vehicleImgDriver, vehicleImgPassenger]) {
          const bad = validateDocumentFile(f);
          if (bad) {
            e.vehicle_photos = bad;
            break;
          }
        }
      }
      return e;
    }
    if (step === 5) {
      if (serviceIds.size === 0) e.services = "Select at least one service.";
      return e;
    }
    if (step === 6) {
      const zipD = zipDigitsOnly(serviceZip);
      if (!zipD) e.service_zip = "Enter your service ZIP code.";
      else if (!isValidUsZipDigits(zipD)) {
        e.service_zip = "Enter a valid 5-digit ZIP (e.g. 30052) or 9-digit ZIP+4.";
      }
      return e;
    }
    return e;
  }

  async function advanceWizard() {
    const errs = validateWizardStep(wizardStep);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const first = FORM_FIELD_ORDER.find((k) => errs[k]);
      setHighlightKey(first ?? null);
      window.requestAnimationFrame(() => {
        if (first) {
          document.getElementById(`driver-field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      return;
    }
    setErrors({});
    setHighlightKey(null);
    const next = wizardStep + 1;
    await persistWizardStep(
      next,
      wizardStep === 2 ? { name: legalFullName.trim(), phone: driverPhone.trim() } : undefined,
    );
  }

  function validateAllFields(): FieldErrors {
    const e: FieldErrors = {};
    if (!legalFullName.trim()) e.profile_name = "Enter your full legal name.";
    const pd = driverPhone.replace(/\D/g, "");
    if (pd.length < 10) e.profile_phone = "Enter a valid phone number (10+ digits).";
    if (!profileHeadshot && !existingProfilePhotoUrl) e.profile_photo = "Upload a profile photo.";
    if (!licenseFront) e.license_front = "Please upload: Driver license (front).";
    if (!licenseBack) e.license_back = "Please upload: Driver license (back).";
    if (!insuranceCard) e.insurance_card = "Please upload: Personal auto insurance.";
    if (!commercialAuto) e.commercial_auto = "Please upload: Commercial auto proof (declarations page).";
    if (!commercialAutoExpiry.trim()) e.commercial_expiry = "Enter commercial coverage expiration date.";
    else if (!isOnOrAfterToday(commercialAutoExpiry)) {
      e.commercial_expiry = "Commercial coverage must be current (not expired).";
    }
    if (!registration) e.registration = "Please upload: Vehicle registration.";
    if (!registrationExpiry.trim()) e.registration_expiry = "Enter vehicle registration expiration date.";
    else if (!isOnOrAfterToday(registrationExpiry)) {
      e.registration_expiry = "Vehicle registration must be current (not expired).";
    }
    if (!confirmCommercialInsurance) {
      e.commercial_ack = "Please read and check the insurance agreement to continue.";
    }
    if (!selfie) e.selfie = "Please upload: Live selfie / verification.";
    if (!backgroundConsent) e.background_consent = "Please upload: Background check consent.";

    const fileChecks: [File | null, FieldErrorKey, string][] = [
      [licenseFront, "license_front", "Driver license (front)"],
      [licenseBack, "license_back", "Driver license (back)"],
      [insuranceCard, "insurance_card", "Personal auto insurance"],
      [commercialAuto, "commercial_auto", "Commercial auto"],
      [registration, "registration", "Vehicle registration"],
      [selfie, "selfie", "Live selfie / verification"],
      [backgroundConsent, "background_consent", "Background check consent"],
    ];
    for (const [f, key, label] of fileChecks) {
      if (f) {
        const err = validateDocumentFile(f);
        if (err) e[key] = `${label}: ${err}`;
      }
    }

    if (!licenseNumber.trim()) e.license_number = "Please enter your driver's license number.";
    if (!licenseExpiry.trim()) e.license_expiry = "Enter license expiration date.";
    else if (!isOnOrAfterToday(licenseExpiry)) {
      e.license_expiry = "License expiration must be a valid future date.";
    }
    if (!licenseState.trim()) e.license_state = "Please enter the state your license was issued in.";
    if (!vehicleYear.trim() || !vehicleMake.trim() || !vehicleModel.trim() || !licensePlate.trim()) {
      e.vehicle_fields = "Please complete all required vehicle fields (year, make, model, plate).";
    }
    if (!vehicleImgFront || !vehicleImgRear || !vehicleImgDriver || !vehicleImgPassenger) {
      e.vehicle_photos = "Upload all four vehicle angle photos.";
    } else {
      for (const f of [vehicleImgFront, vehicleImgRear, vehicleImgDriver, vehicleImgPassenger]) {
        const bad = validateDocumentFile(f);
        if (bad) {
          e.vehicle_photos = bad;
          break;
        }
      }
    }
    if (!insuranceProvider.trim()) e.insurance_provider = "Enter your insurance provider.";
    if (!insuranceExpiry.trim()) e.insurance_expiry = "Enter policy expiration date.";
    else if (!isOnOrAfterToday(insuranceExpiry)) e.insurance_expiry = "Insurance policy must be current (not expired).";
    if (serviceIds.size === 0) e.services = "Select at least one service.";
    const zipD = zipDigitsOnly(serviceZip);
    if (!zipD) e.service_zip = "Enter your service ZIP code.";
    else if (!isValidUsZipDigits(zipD)) {
      e.service_zip = "Enter a valid 5-digit ZIP (e.g. 30052) or 9-digit ZIP+4.";
    }
    if (profileHeadshot) {
      const err = validateDocumentFile(profileHeadshot);
      if (err) e.profile_photo = err;
    }
    return e;
  }

  function hasDraftToPersist(): boolean {
    if (
      licenseFront ||
      licenseBack ||
      insuranceCard ||
      commercialAuto ||
      registration ||
      selfie ||
      backgroundConsent ||
      profileHeadshot ||
      vehicleImgFront ||
      vehicleImgRear ||
      vehicleImgDriver ||
      vehicleImgPassenger
    ) {
      return true;
    }
    if (
      licenseNumber.trim() ||
      licenseExpiry.trim() ||
      licenseState.trim() ||
      vehicleMake.trim() ||
      vehicleModel.trim() ||
      licensePlate.trim() ||
      vehicleColor.trim() ||
      plateState.trim() ||
      insuranceProvider.trim() ||
      policyNumber.trim() ||
      insuranceExpiry.trim() ||
      commercialAutoExpiry.trim() ||
      registrationExpiry.trim() ||
      serviceZip.trim() ||
      legalFullName.trim() ||
      driverPhone.trim()
    ) {
      return true;
    }
    if (confirmCommercialInsurance) return true;
    if (maxMiles.trim() !== "25") return true;
    return false;
  }

  async function saveDraftToFirestore(): Promise<void> {
    if (!user) return;
    const uid = user.uid;
    const base = `drivers/${uid}/documents`;
    const pref = doc(db, "providers", uid);
    const snap = await getDoc(pref);
    const existing = (snap.exists() ? (snap.data().documents as ProviderDocuments | undefined) : undefined) ?? {};

    const merged: ProviderDocuments = { ...existing };

    if (licenseFront) {
      merged.licenseFront = await uploadDriverDocument(
        `${base}/license_front.${extForFile(licenseFront)}`,
        licenseFront,
      );
    }
    if (licenseBack) {
      merged.licenseBack = await uploadDriverDocument(
        `${base}/license_back.${extForFile(licenseBack)}`,
        licenseBack,
      );
    }
    if (insuranceCard) {
      merged.insurance = await uploadDriverDocument(`${base}/insurance.${extForFile(insuranceCard)}`, insuranceCard);
    }
    if (commercialAuto) {
      merged.commercialAuto = await uploadDriverDocument(
        `${base}/commercial_auto.${extForFile(commercialAuto)}`,
        commercialAuto,
      );
    }
    if (registration) {
      merged.registration = await uploadDriverDocument(`${base}/registration.${extForFile(registration)}`, registration);
    }
    if (selfie) {
      merged.selfie = await uploadDriverDocument(`${base}/selfie.${extForFile(selfie)}`, selfie);
    }
    if (profileHeadshot) {
      merged.profilePhoto = await uploadDriverDocument(
        `${base}/profile_photo.${extForFile(profileHeadshot)}`,
        profileHeadshot,
      );
    }
    if (vehicleImgFront) {
      merged.vehiclePhotoFront = await uploadDriverDocument(
        `${base}/vehicle_front.${extForFile(vehicleImgFront)}`,
        vehicleImgFront,
      );
    }
    if (vehicleImgRear) {
      merged.vehiclePhotoRear = await uploadDriverDocument(
        `${base}/vehicle_rear.${extForFile(vehicleImgRear)}`,
        vehicleImgRear,
      );
    }
    if (vehicleImgDriver) {
      merged.vehiclePhotoDriverSide = await uploadDriverDocument(
        `${base}/vehicle_driver.${extForFile(vehicleImgDriver)}`,
        vehicleImgDriver,
      );
    }
    if (vehicleImgPassenger) {
      merged.vehiclePhotoPassengerSide = await uploadDriverDocument(
        `${base}/vehicle_passenger.${extForFile(vehicleImgPassenger)}`,
        vehicleImgPassenger,
      );
    }
    if (backgroundConsent) {
      merged.backgroundConsent = await uploadDriverDocument(
        `${base}/background_consent.${extForFile(backgroundConsent)}`,
        backgroundConsent,
      );
    }

    if (licenseNumber.trim()) merged.licenseNumber = licenseNumber.trim();
    if (licenseExpiry) merged.licenseExpiry = licenseExpiry;
    if (licenseState.trim()) merged.licenseState = licenseState.trim();
    if (vehicleYear.trim()) merged.vehicleYear = vehicleYear;
    if (vehicleMake.trim()) merged.vehicleMake = vehicleMake.trim();
    if (vehicleModel.trim()) merged.vehicleModel = vehicleModel.trim();
    if (vehicleColor.trim()) merged.vehicleColor = vehicleColor.trim();
    if (licensePlate.trim()) merged.licensePlate = licensePlate.trim().toUpperCase();
    if (plateState.trim()) merged.plateState = plateState.trim();
    if (insuranceProvider.trim()) merged.insuranceProvider = insuranceProvider.trim();
    merged.policyNumber = policyNumber.trim() || "";
    if (insuranceExpiry) merged.insuranceExpiry = insuranceExpiry;
    if (commercialAutoExpiry) merged.commercialAutoExpiry = commercialAutoExpiry;
    if (registrationExpiry) merged.registrationExpiry = registrationExpiry;
    if (zipDigitsOnly(serviceZip)) merged.serviceZip = formatZipForStorage(serviceZip);
    merged.maxDistanceMiles = Math.min(200, Math.max(5, parseInt(maxMiles, 10) || 25));
    merged.serviceIds = Array.from(serviceIds);

    const photo = merged.profilePhoto ?? merged.selfie ?? existing.profilePhoto ?? existing.selfie;
    const topLevel: Record<string, unknown> = {
      documents: merged,
      serviceIds: merged.serviceIds,
    };
    const z = formatZipForStorage(serviceZip);
    if (z) {
      topLevel.zip = z;
      topLevel.city = z;
    }
    if (photo) topLevel.photoUrl = photo;
    if (legalFullName.trim()) topLevel.name = legalFullName.trim();
    if (driverPhone.trim()) topLevel.phone = driverPhone.trim();
    await setDoc(pref, topLevel, { merge: true });
  }

  async function handleSignOutClick() {
    if (!firebaseAuth || !user) return;
    const ok = window.confirm("Sign out? Your progress is saved.");
    if (!ok) return;
    setSigningOut(true);
    try {
      if (hasDraftToPersist()) {
        await saveDraftToFirestore();
      }
      await signOut(firebaseAuth);
      router.replace("/?modal=login");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not complete sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  async function runSubmitApplication() {
    if (!user) return;
    const uid = user.uid;
    const base = `drivers/${uid}/documents`;

    setSubmitting(true);
    setUploadProgress(0);

    try {
      let profilePhotoUrl = existingProfilePhotoUrl ?? "";
      if (profileHeadshot) {
        profilePhotoUrl = await uploadDriverDocument(
          `${base}/profile_photo.${extForFile(profileHeadshot)}`,
          profileHeadshot,
          (p) => setUploadProgress(Math.round(p * 0.06)),
        );
      }
      if (!profilePhotoUrl) {
        throw new Error("Upload a profile photo");
      }

      const uploadItems = [
        { path: `${base}/license_front.${extForFile(licenseFront!)}`, file: licenseFront! },
        { path: `${base}/license_back.${extForFile(licenseBack!)}`, file: licenseBack! },
        { path: `${base}/insurance.${extForFile(insuranceCard!)}`, file: insuranceCard! },
        { path: `${base}/commercial_auto.${extForFile(commercialAuto!)}`, file: commercialAuto! },
        { path: `${base}/registration.${extForFile(registration!)}`, file: registration! },
        { path: `${base}/selfie.${extForFile(selfie!)}`, file: selfie! },
        { path: `${base}/background_consent.${extForFile(backgroundConsent!)}`, file: backgroundConsent! },
      ];

      const [lf, lb, ins, comm, reg, self, bg] = await uploadDriverDocumentsSequential(
        uploadItems,
        (p) => setUploadProgress(6 + Math.round(p * 0.74)),
      );

      const vehicleItems = [
        { path: `${base}/vehicle_front.${extForFile(vehicleImgFront!)}`, file: vehicleImgFront! },
        { path: `${base}/vehicle_rear.${extForFile(vehicleImgRear!)}`, file: vehicleImgRear! },
        { path: `${base}/vehicle_driver.${extForFile(vehicleImgDriver!)}`, file: vehicleImgDriver! },
        { path: `${base}/vehicle_passenger.${extForFile(vehicleImgPassenger!)}`, file: vehicleImgPassenger! },
      ];
      const [vf, vr, vd, vp] = await uploadDriverDocumentsSequential(vehicleItems, (p) =>
        setUploadProgress(80 + Math.round(p * 0.19)),
      );

      const documents: ProviderDocuments = {
        licenseFront: lf,
        licenseBack: lb,
        insurance: ins,
        commercialAuto: comm,
        registration: reg,
        selfie: self,
        backgroundConsent: bg,
        profilePhoto: profilePhotoUrl,
        vehiclePhotoFront: vf,
        vehiclePhotoRear: vr,
        vehiclePhotoDriverSide: vd,
        vehiclePhotoPassengerSide: vp,
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
        policyNumber: policyNumber.trim() || "",
        insuranceExpiry,
        commercialAutoExpiry,
        registrationExpiry,
        serviceZip: formatZipForStorage(serviceZip),
        maxDistanceMiles: Math.min(200, Math.max(5, parseInt(maxMiles, 10) || 25)),
        serviceIds: Array.from(serviceIds),
      };

      const caTs = dateStrToTimestampEndOfDay(commercialAutoExpiry);
      const personalTs = dateStrToTimestampEndOfDay(insuranceExpiry);
      const licenseTs = dateStrToTimestampEndOfDay(licenseExpiry);
      const regTs = dateStrToTimestampEndOfDay(registrationExpiry);

      await updateDoc(doc(db, "providers", uid), {
        documents,
        documentsSubmitted: true,
        verificationStatus: "pending",
        accountStatus: "pending_review",
        approvedByCEO: false,
        isOnline: false,
        status: "offline",
        submittedAt: serverTimestamp(),
        photoUrl: profilePhotoUrl,
        name: legalFullName.trim(),
        phone: driverPhone.trim(),
        driverWizardStep: 8,
        driverWizardSubmitted: true,
        zip: formatZipForStorage(serviceZip),
        serviceIds: documents.serviceIds,
        city: formatZipForStorage(serviceZip),
        ...(caTs ? { commercialAutoExpiry: caTs } : {}),
        ...(personalTs ? { personalAutoExpiry: personalTs } : {}),
        ...(licenseTs ? { licenseExpiryDate: licenseTs } : {}),
        ...(regTs ? { registrationExpiryDate: regTs } : {}),
        agreedToCommercialInsuranceTermsAt: serverTimestamp(),
        commercialInsuranceReminded30dAt: deleteField(),
        commercialInsuranceReminded7dAt: deleteField(),
      });

      await sendEmailVerification(user, {
        url: "https://gridd.click/",
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

      setSubmitSuccess(true);
    } catch (err) {
      setErrors({
        general: formatSubmitError(err),
      });
      setHighlightKey("general");
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (wizardStep !== 7) {
      setErrors({ general: "Complete steps 2–6 using Next, then review & submit on step 7." });
      setHighlightKey("general");
      return;
    }

    const nextErrors = validateAllFields();
    const failEntries = Object.entries(nextErrors).filter(([, v]) => Boolean(v));
    if (failEntries.length > 0) {
      console.log("[driver-docs] Submit blocked — failing validation fields:", Object.fromEntries(failEntries));
      console.log(
        "[driver-docs] Keys still failing:",
        failEntries.map(([k]) => k),
      );
      setErrors(nextErrors);
      const first = FORM_FIELD_ORDER.find((k) => nextErrors[k]);
      setHighlightKey(first ?? null);
      window.requestAnimationFrame(() => {
        if (first) {
          document.getElementById(`driver-field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      return;
    }

    setHighlightKey(null);
    setErrors(EMPTY_ERRORS);
    await runSubmitApplication();
  }

  async function retryUpload() {
    if (!user) return;
    const nextErrors = validateAllFields();
    const failEntries = Object.entries(nextErrors).filter(([, v]) => Boolean(v));
    if (failEntries.length > 0) {
      setErrors(nextErrors);
      const first = FORM_FIELD_ORDER.find((k) => nextErrors[k]);
      setHighlightKey(first ?? null);
      window.requestAnimationFrame(() => {
        if (first) {
          document.getElementById(`driver-field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      return;
    }
    setHighlightKey(null);
    setErrors(EMPTY_ERRORS);
    await runSubmitApplication();
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-full items-center justify-center bg-[#060606] px-6 py-20 text-zinc-500">
        Loading…
      </main>
    );
  }

  if (submitSuccess) {
    return (
      <main
        className="mx-auto flex min-h-full max-w-lg flex-col items-center justify-center px-6 pb-24 pt-16 text-center"
        style={{ background: "#060606", color: "#eee" }}
      >
        <p className="mt-2 text-lg leading-relaxed text-zinc-100">
          ⏳ Submitted! CEO review within 1-3 business days.
        </p>
        <Link
          href="/driver-pending"
          className="mt-10 inline-flex min-h-[52px] w-full max-w-sm items-center justify-center rounded-[22px] px-6 text-base font-bold text-black transition hover:opacity-90"
          style={{
            fontFamily: "var(--font-syne), ui-sans-serif, system-ui, sans-serif",
            background: "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)",
            boxShadow: "0 8px 24px rgba(255, 107, 0, 0.35)",
          }}
        >
          View application status
        </Link>
      </main>
    );
  }

  const stepHeadline =
    wizardStep === 2
      ? "Profile setup"
      : wizardStep === 3
        ? "Documents"
        : wizardStep === 4
          ? "Vehicle info"
          : wizardStep === 5
            ? "Services you offer"
            : wizardStep === 6
              ? "Service area"
              : "Review & submit";

  const stepBlurb =
    wizardStep === 2
      ? "Legal name, phone, and a clear profile photo."
      : wizardStep === 3
        ? "License, insurance, commercial endorsement, registration, live selfie, and background consent — images or PDF (max 15MB each)."
        : wizardStep === 4
          ? "Year, make, model, plate, color — plus four exterior photos."
          : wizardStep === 5
            ? "Choose every GRIDD service you’re willing to run."
            : wizardStep === 6
              ? "Home ZIP and how far you’ll travel for jobs."
              : "Confirm the insurance agreement, then submit for CEO review.";

  return (
    <main className="mx-auto max-w-2xl px-6 pb-24 pt-16" style={{ background: "#060606", color: "#eee" }}>
      <p className="text-xs font-semibold uppercase tracking-widest text-[#00FF88]">Driver onboarding</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{stepHeadline}</h1>
      <p className="mt-2 text-sm text-zinc-400">{stepBlurb}</p>

      {wizardStep === 3 ? (
        <div
          className={[
            "mt-4 rounded-2xl border px-4 py-3 text-center text-sm font-semibold transition-colors",
            categoriesDone >= 6
              ? "border-[#00FF88]/45 bg-[#00FF88]/12 text-[#00FF88]"
              : "border-zinc-700/80 bg-zinc-900/40 text-zinc-300",
          ].join(" ")}
        >
          {categoriesDone} of 6 document categories complete
        </div>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-8" noValidate>
        <div className="sticky top-0 z-20 -mx-2 rounded-2xl border border-[#1e1e1e] bg-[#060606]/96 px-4 py-3 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-[#00FF88]">
              Step {wizardStep} of 7 — {stepHeadline}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={wizardStep <= 2 || submitting}
                onClick={() => void persistWizardStep(wizardStep - 1)}
                className="rounded-xl border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Back
              </button>
              <button
                type="button"
                disabled={wizardStep >= 7 || submitting}
                onClick={() => void advanceWizard()}
                className="rounded-xl border border-[#00FF88]/50 bg-[#00FF88]/10 px-3 py-1.5 text-xs font-semibold text-[#00FF88] transition enabled:hover:bg-[#00FF88]/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-zinc-500">
            Follow steps in order — you can’t skip ahead. Submit is only available on step 7.
          </p>
        </div>

        {wizardStep === 2 ? (
          <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
            <h2 className="text-lg font-semibold text-[#00FF88]">👤 Profile</h2>
            <p className="mt-1 text-xs text-zinc-500">Use your legal name — it must match your license.</p>
            <div className="mt-4 grid gap-4">
              <FieldHighlight fieldKey="profile_name" highlightKey={highlightKey} message={errors.profile_name}>
                <div>
                  <label className="text-xs text-zinc-500">Full legal name</label>
                  <Input value={legalFullName} onChange={(e) => setLegalFullName(e.target.value)} autoComplete="name" />
                </div>
              </FieldHighlight>
              <FieldHighlight fieldKey="profile_phone" highlightKey={highlightKey} message={errors.profile_phone}>
                <div>
                  <label className="text-xs text-zinc-500">Mobile phone</label>
                  <Input
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(555) 555-5555"
                  />
                </div>
              </FieldHighlight>
              <FieldHighlight fieldKey="profile_photo" highlightKey={highlightKey} message={errors.profile_photo}>
                <label className="block text-xs text-zinc-500">
                  Profile photo (clear face, good lighting)
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 w-full text-sm"
                    onChange={(e) => handleFileField("profile_photo", e.target.files?.[0] ?? null, setProfileHeadshot)}
                  />
                  {profileHeadshot ? (
                    <span className="mt-1 block text-[10px] text-[#00FF88]">{profileHeadshot.name}</span>
                  ) : existingProfilePhotoUrl ? (
                    <span className="mt-1 block text-[10px] text-zinc-500">Using saved photo — upload to replace.</span>
                  ) : null}
                </label>
              </FieldHighlight>
            </div>
          </section>
        ) : null}

        {wizardStep === 3 ? (
          <>
        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">🚗 Driver&apos;s license</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldHighlight fieldKey="license_front" highlightKey={highlightKey} message={errors.license_front}>
              <label className="block text-xs text-zinc-500">
                Front
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="mt-1 w-full text-sm"
                  onChange={(e) =>
                    handleFileField("license_front", e.target.files?.[0] ?? null, setLicenseFront)
                  }
                />
              </label>
            </FieldHighlight>
            <FieldHighlight fieldKey="license_back" highlightKey={highlightKey} message={errors.license_back}>
              <label className="block text-xs text-zinc-500">
                Back
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="mt-1 w-full text-sm"
                  onChange={(e) =>
                    handleFileField("license_back", e.target.files?.[0] ?? null, setLicenseBack)
                  }
                />
              </label>
            </FieldHighlight>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FieldHighlight fieldKey="license_number" highlightKey={highlightKey} message={errors.license_number}>
              <div>
                <label className="text-xs text-zinc-500">License number</label>
                <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
              </div>
            </FieldHighlight>
            <FieldHighlight fieldKey="license_expiry" highlightKey={highlightKey} message={errors.license_expiry}>
              <div>
                <label className="text-xs text-zinc-500">Expiry</label>
                <Input type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} />
              </div>
            </FieldHighlight>
            <FieldHighlight fieldKey="license_state" highlightKey={highlightKey} message={errors.license_state}>
              <div>
                <label className="text-xs text-zinc-500">State issued</label>
                <Input value={licenseState} onChange={(e) => setLicenseState(e.target.value)} placeholder="GA" />
              </div>
            </FieldHighlight>
          </div>
        </section>

        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">🛡️ Personal auto insurance</h2>
          <p className="mt-1 text-xs text-zinc-500">Your standard / personal auto policy (must be current).</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FieldHighlight fieldKey="insurance_provider" highlightKey={highlightKey} message={errors.insurance_provider}>
              <div>
                <label className="text-xs text-zinc-500">Provider</label>
                <Input value={insuranceProvider} onChange={(e) => setInsuranceProvider(e.target.value)} />
              </div>
            </FieldHighlight>
            <div>
              <label className="text-xs text-zinc-500">Policy #</label>
              <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
            </div>
            <FieldHighlight fieldKey="insurance_expiry" highlightKey={highlightKey} message={errors.insurance_expiry}>
              <div>
                <label className="text-xs text-zinc-500">Policy expiry</label>
                <Input type="date" value={insuranceExpiry} onChange={(e) => setInsuranceExpiry(e.target.value)} />
              </div>
            </FieldHighlight>
            <FieldHighlight fieldKey="insurance_card" highlightKey={highlightKey} message={errors.insurance_card}>
              <label className="block text-xs text-zinc-500">
                Personal insurance card (image or PDF)
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="mt-1 w-full text-sm"
                  onChange={(e) =>
                    handleFileField("insurance_card", e.target.files?.[0] ?? null, setInsuranceCard)
                  }
                />
              </label>
            </FieldHighlight>
          </div>
        </section>

        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">🏢 Commercial auto insurance</h2>
          <div
            className="mt-3 rounded-2xl border border-amber-500/35 bg-amber-950/25 px-4 py-4"
            role="region"
            aria-label="Commercial insurance requirement"
          >
            <p className="text-sm font-bold tracking-tight text-amber-200">⚠️ Insurance Requirement</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-200">
              GRIDD requires all drivers to maintain commercial auto insurance or a commercial endorsement on their
              personal auto policy.
            </p>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-amber-100/95">
              This is NON-NEGOTIABLE and will be verified before account approval.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              Most drivers add commercial coverage for $30–50/month to their existing policy. Contact your provider
              today.
            </p>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            Ask your carrier for a commercial use rider or endorsement, then upload your declarations page showing
            commercial coverage.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FieldHighlight fieldKey="commercial_expiry" highlightKey={highlightKey} message={errors.commercial_expiry}>
              <div>
                <label className="text-xs text-zinc-500">Commercial coverage expiry</label>
                <Input type="date" value={commercialAutoExpiry} onChange={(e) => setCommercialAutoExpiry(e.target.value)} />
              </div>
            </FieldHighlight>
            <FieldHighlight fieldKey="commercial_auto" highlightKey={highlightKey} message={errors.commercial_auto}>
              <label className="block text-xs text-zinc-500">
                Declarations / proof (image or PDF)
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="mt-1 w-full text-sm"
                  onChange={(e) =>
                    handleFileField("commercial_auto", e.target.files?.[0] ?? null, setCommercialAuto)
                  }
                />
              </label>
            </FieldHighlight>
          </div>
        </section>

        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">📋 Vehicle registration document</h2>
          <FieldHighlight fieldKey="registration" highlightKey={highlightKey} message={errors.registration}>
            <label className="mt-2 block text-xs text-zinc-500">
              Registration document
              <input
                type="file"
                accept="image/*,application/pdf"
                className="mt-1 w-full text-sm"
                onChange={(e) =>
                  handleFileField("registration", e.target.files?.[0] ?? null, setRegistration)
                }
              />
            </label>
          </FieldHighlight>
          <FieldHighlight fieldKey="registration_expiry" highlightKey={highlightKey} message={errors.registration_expiry}>
            <div className="mt-3 max-w-xs">
              <label className="text-xs text-zinc-500">Registration expiry (on document)</label>
              <Input type="date" value={registrationExpiry} onChange={(e) => setRegistrationExpiry(e.target.value)} />
            </div>
          </FieldHighlight>
        </section>

        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">🤳 Live selfie</h2>
          <p className="mt-1 text-xs text-zinc-500">Clear photo of your face (used for verification).</p>
          <FieldHighlight fieldKey="selfie" highlightKey={highlightKey} message={errors.selfie}>
            <label className="mt-2 block text-xs text-zinc-500">
              Selfie photo
              <input
                type="file"
                accept="image/*"
                className="mt-1 w-full text-sm"
                onChange={(e) => handleFileField("selfie", e.target.files?.[0] ?? null, setSelfie)}
              />
            </label>
          </FieldHighlight>
        </section>

        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">📄 Background check consent</h2>
          <p className="mt-1 text-xs text-zinc-500">Signed consent form (photo or PDF).</p>
          <FieldHighlight fieldKey="background_consent" highlightKey={highlightKey} message={errors.background_consent}>
            <label className="mt-2 block text-xs text-zinc-500">
              Upload signed form
              <input
                type="file"
                accept="image/*,application/pdf"
                className="mt-1 w-full text-sm"
                onChange={(e) =>
                  handleFileField("background_consent", e.target.files?.[0] ?? null, setBackgroundConsent)
                }
              />
            </label>
          </FieldHighlight>
        </section>
          </>
        ) : null}

        {wizardStep === 4 ? (
        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">🚙 Vehicle details & photos</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Year, make, model, plate — plus four exterior photos (front, rear, driver side, passenger side).
          </p>
          <FieldHighlight fieldKey="vehicle_fields" highlightKey={highlightKey} message={errors.vehicle_fields}>
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
                <Input value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Model</label>
                <Input value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Color</label>
                <Input value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Plate</label>
                <Input value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Plate state</label>
                <Input value={plateState} onChange={(e) => setPlateState(e.target.value)} />
              </div>
            </div>
          </FieldHighlight>
          <FieldHighlight fieldKey="vehicle_photos" highlightKey={highlightKey} message={errors.vehicle_photos}>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-zinc-500">
                Vehicle — Front
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 w-full text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setVehicleImgFront(f);
                    if (f) {
                      const bad = validateDocumentFile(f);
                      setErrors((prev) => ({ ...prev, ...(bad ? { vehicle_photos: bad } : {}) }));
                      if (!bad) clearErrorKey("vehicle_photos");
                    }
                  }}
                />
              </label>
              <label className="block text-xs text-zinc-500">
                Vehicle — Rear
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 w-full text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setVehicleImgRear(f);
                    if (f) {
                      const bad = validateDocumentFile(f);
                      setErrors((prev) => ({ ...prev, ...(bad ? { vehicle_photos: bad } : {}) }));
                      if (!bad) clearErrorKey("vehicle_photos");
                    }
                  }}
                />
              </label>
              <label className="block text-xs text-zinc-500">
                Vehicle — Driver side
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 w-full text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setVehicleImgDriver(f);
                    if (f) {
                      const bad = validateDocumentFile(f);
                      setErrors((prev) => ({ ...prev, ...(bad ? { vehicle_photos: bad } : {}) }));
                      if (!bad) clearErrorKey("vehicle_photos");
                    }
                  }}
                />
              </label>
              <label className="block text-xs text-zinc-500">
                Vehicle — Passenger side
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 w-full text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setVehicleImgPassenger(f);
                    if (f) {
                      const bad = validateDocumentFile(f);
                      setErrors((prev) => ({ ...prev, ...(bad ? { vehicle_photos: bad } : {}) }));
                      if (!bad) clearErrorKey("vehicle_photos");
                    }
                  }}
                />
              </label>
            </div>
          </FieldHighlight>
        </section>
        ) : null}

        {wizardStep === 7 ? (
        <section className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-5">
          <h2 className="text-lg font-semibold text-amber-200">Driver insurance agreement</h2>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            By joining GRIDD as a driver you confirm that:
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-[11px] leading-relaxed text-zinc-400">
            <li>You maintain valid personal auto insurance at all times.</li>
            <li>You maintain commercial auto coverage or endorsement while working on the GRIDD platform.</li>
            <li>You understand GRIDD is not responsible for accidents, injuries or damages that occur while completing
            jobs.</li>
            <li>Your insurance is primary coverage for any incident while using the GRIDD platform.</li>
            <li>You will notify GRIDD immediately if your insurance lapses or is cancelled.</li>
            <li>Failure to maintain required insurance will result in immediate account suspension.</li>
          </ol>
          <FieldHighlight fieldKey="commercial_ack" highlightKey={highlightKey} message={errors.commercial_ack}>
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={confirmCommercialInsurance}
                onChange={(e) => {
                  setConfirmCommercialInsurance(e.target.checked);
                  if (e.target.checked) clearErrorKey("commercial_ack");
                }}
                className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600"
              />
              <span>
                I confirm I have or will obtain commercial auto insurance before going live on GRIDD.
              </span>
            </label>
          </FieldHighlight>
        </section>
        ) : null}

        {wizardStep === 5 ? (
        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">Services you offer</h2>
          <p className="mt-4 text-xs text-zinc-500">Tap every category you are willing to run on GRIDD.</p>
          <FieldHighlight fieldKey="services" highlightKey={highlightKey} message={errors.services}>
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
          </FieldHighlight>
        </section>
        ) : null}

        {wizardStep === 6 ? (
        <section className="rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
          <h2 className="text-lg font-semibold text-[#00FF88]">ZIP & radius</h2>
          <p className="mt-1 text-xs text-zinc-500">Where you start from and how far you will go for pickups.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FieldHighlight fieldKey="service_zip" highlightKey={highlightKey} message={errors.service_zip}>
              <div>
                <label className="text-xs text-zinc-500">ZIP code</label>
                <Input
                  value={serviceZip}
                  onChange={(e) => setServiceZip(e.target.value)}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="e.g. 30052"
                  className="border-[var(--border)] bg-[var(--card)]"
                />
              </div>
            </FieldHighlight>
            <div>
              <label className="text-xs text-zinc-500">Max distance (miles)</label>
              <Input type="number" min={5} max={200} value={maxMiles} onChange={(e) => setMaxMiles(e.target.value)} />
            </div>
          </div>
        </section>
        ) : null}

        {remainingErrorMessages.length > 0 ? (
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-red-400">
            {remainingErrorMessages.map((msg, i) => (
              <li key={`${i}-${msg.slice(0, 24)}`}>{msg}</li>
            ))}
          </ul>
        ) : null}
        {errors.general ? (
          <div className="mt-2 space-y-3">
            <FieldHighlight fieldKey="general" highlightKey={highlightKey} message={errors.general}>
              <p className="text-sm text-red-400">{errors.general}</p>
            </FieldHighlight>
            <button
              type="button"
              onClick={() => void retryUpload()}
              className="w-full rounded-xl border border-[#ff6b00]/50 bg-[#ff6b00]/10 py-3 text-sm font-semibold text-[#ff9500] transition hover:bg-[#ff6b00]/20"
            >
              Tap to retry
            </button>
          </div>
        ) : null}

        {wizardStep === 7 ? (
          <button
            type="submit"
            disabled={submitting}
            className="mx-auto mt-2 flex w-full min-h-[56px] max-w-2xl items-center justify-center gap-2 rounded-[22px] px-5 py-4 text-base font-bold tracking-tight text-white shadow-lg transition enabled:hover:brightness-110 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              fontFamily: "var(--font-syne), ui-sans-serif, system-ui, sans-serif",
              background: "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)",
              boxShadow: "0 8px 24px rgba(255, 107, 0, 0.35)",
            }}
          >
            {submitting ? `Uploading… ${uploadProgress}%` : "Submit for CEO Review 🚀"}
          </button>
        ) : null}
      </form>

      <p className="mt-8 text-center text-xs text-zinc-600">
        Questions?{" "}
        <a href="mailto:support@gridd.click" className="text-[#00FF88]">
          support@gridd.click
        </a>
      </p>

      <div className="mt-4 mb-6 flex justify-center">
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void handleSignOutClick()}
          className="border-0 bg-transparent p-0 shadow-none outline-none ring-0 disabled:opacity-50"
          style={{ fontSize: 12, color: "#666" }}
        >
          🚪 Sign out
        </button>
      </div>
    </main>
  );
}
