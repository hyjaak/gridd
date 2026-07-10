"use client";

import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type JobType = "delivery" | "errand" | "hauling";

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: "delivery", label: "📦 Delivery" },
  { value: "errand", label: "🏃 Errand" },
  { value: "hauling", label: "🛻 Hauling" },
];

export default function QuotePage() {
  const [jobType, setJobType] = useState<JobType>("delivery");
  const [pickupCity, setPickupCity] = useState("");
  const [dropoffCity, setDropoffCity] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickupCity.trim() || !dropoffCity.trim() || !phone.trim() || !description.trim()) {
      setError("Please fill in all fields");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, "dispatchJobs"), {
        market: "DAY",
        status: "request",
        customerName: phone.replace(/\D/g, ""),
        customerPhone: phone.startsWith("+") ? phone : `+1${phone.replace(/\D/g, "")}`,
        jobType,
        pickupCity: pickupCity.trim(),
        dropoffCity: dropoffCity.trim(),
        description: description.trim(),
        source: "form",
        payoutPct: 0,
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (e) {
      console.error("quote submit error:", e);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Got it!</h1>
          <p className="text-gray-600">
            You'll have a flat price within the hour. We'll text you at{" "}
            <strong className="text-gray-900">{phone}</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Get a Price</h1>
          <p className="text-gray-500 text-sm mt-1">
            Tell us what you need — we'll text you a flat quote.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Job Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What do you need?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {JOB_TYPES.map((jt) => (
                <button
                  key={jt.value}
                  type="button"
                  onClick={() => setJobType(jt.value)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                    jobType === jt.value
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {jt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pickup City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pickup city
            </label>
            <input
              type="text"
              value={pickupCity}
              onChange={(e) => setPickupCity(e.target.value)}
              placeholder="e.g. Dayton"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Dropoff City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dropoff city
            </label>
            <input
              type="text"
              value={dropoffCity}
              onChange={(e) => setDropoffCity(e.target.value)}
              placeholder="e.g. Cincinnati"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(937) 555-1234"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Describe what you need
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Pick up a package from..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white rounded-lg py-3 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Submitting..." : "Get my price"}
          </button>
        </form>
      </div>
    </div>
  );
}