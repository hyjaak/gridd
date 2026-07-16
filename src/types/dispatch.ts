export type JobStatus = "request" | "quoted" | "accepted" | "assigned" | "pickup" | "in_progress" | "proof" | "paid" | "declined" | "cancelled";

export type StopAddress = {
  street?: string;
  city: string;
  unit?: string;
  notes?: string;
};

export type DispatchJob = {
  id: string;
  market: string;
  status: JobStatus;
  customerPhone: string;
  contactName?: string;
  jobType: string;
  pickupAddress: StopAddress;
  dropoffAddress: StopAddress;
  description: string;
  source: string;
  timeWindow?: string;
  itemPhotoUrl?: string;
  quoteAmount?: number;
  createdAt?: any;
  quotedAt?: any;
  paidAt?: any;
};
