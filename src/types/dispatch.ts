export type JobStatus = "request" | "quoted" | "accepted" | "assigned" | "pickup" | "in_progress" | "proof" | "paid" | "declined" | "cancelled";

export type StopAddress = {
  street?: string;
  city: string;
  unit?: string;
  notes?: string;
};

export type OfferLogEntry = {
  by: "owner" | "customer";
  amount: number;
  at: any;
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
  estMiles?: number;
  estPrice?: number;
  proofPhotoUrl?: string;
  paymentMethod?: string;
  createdAt?: any;
  quotedAt?: any;
  acceptedAt?: any;
  paidAt?: any;
  offerAmount?: number;
  offerBy?: "owner" | "customer";
  agreedAmount?: number;
  offerLog?: OfferLogEntry[];
};