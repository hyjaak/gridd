"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import type { DispatchJob } from "@/types/dispatch";

interface Props {
  children: ReactNode;
  jobs?: DispatchJob[];
}

interface State {
  hasError: boolean;
  error?: Error;
}

const STATUS_LABEL: Record<string, string> = {
  request: "NEW", quoted: "QUOTED", accepted: "BOOKED", assigned: "BOOKED",
  pickup: "PICKUP", in_progress: "EN ROUTE", proof: "PHOTO", paid: "PAID",
};

export class DispatchErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[DispatchErrorBoundary] Caught error:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const jobs = this.props.jobs;
      return (
        <div className="min-h-screen bg-[#eef3ef] font-['Inter',sans-serif] text-[#101613] p-6">
          <div className="max-w-3xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <h2 className="text-red-800 font-bold text-lg mb-1">Board Error</h2>
              <p className="text-red-700 text-sm mb-2">{this.state.error?.message || "Something went wrong"}</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-[#0e9f6e] text-white font-bold text-sm px-4 py-2 rounded-full cursor-pointer border-none"
              >
                Reload page
              </button>
            </div>

            {/* Plain job list fallback — board must NEVER fully fail */}
            {jobs && jobs.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-[12.5px] font-extrabold tracking-widest uppercase text-[#5c6a62]">
                  Jobs ({jobs.length})
                </h3>
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="bg-white border border-[rgba(16,22,19,0.09)] rounded-[18px] p-[15px_15px_13px] shadow-[0_10px_30px_rgba(16,22,19,0.06)]"
                  >
                    <div className="flex justify-between items-center gap-2 mb-1">
                      <span className="font-extrabold text-[15px]">{job.contactName || "Unknown"}</span>
                      <span className="text-[9.5px] font-extrabold rounded-md px-1.5 py-0.5 bg-[#101613] text-white">
                        {STATUS_LABEL[job.status] || job.status}
                      </span>
                    </div>
                    <div className="text-[12.5px] text-[#5c6a62] font-semibold">
                      {job.jobType} · {job.pickupAddress.city} → {job.dropoffAddress.city}
                    </div>
                    {job.status === "request" && (
                      <div className="text-[11px] font-semibold text-[#5c6a62] mt-1">
                        {job.estPrice ? `≈ $${job.estPrice} suggested` : ""}
                      </div>
                    )}
                    {job.quoteAmount != null && (
                      <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[19px] text-[#0e9f6e] mt-1">
                        ${job.quoteAmount.toFixed(2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-[#5c6a62] font-semibold py-8">No jobs to display.</div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
