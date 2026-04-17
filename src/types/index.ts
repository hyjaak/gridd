export type UserRole = "customer" | "driver" | "admin";

export type User = {
  uid: string;
  email?: string;
  phone?: string;
  name?: string;
  role: UserRole;
  agreementsSigned?: string[];
  createdAt: string;
  blocked?: boolean;
  /** Temporary suspension — ISO time after which login is allowed */
  suspendedUntil?: string;
};

export type ServiceTier = "standard" | "priority" | "premium";

export type JobStatus =
  | "draft"
  | "pending"
  | "requested"
  | "active"
  | "assigned"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "disputed";

export type PaymentStatus = "pending" | "confirmed" | "failed";

export type PayoutStatus = "none" | "pending" | "paid" | "failed";

export type Job = {
  id: string;
  customerUid: string;
  /** Same as providerUid — set together for compatibility */
  providerId?: string;
  providerUid?: string;
  serviceId: string;
  serviceName: string;
  tier: ServiceTier;
  status: JobStatus;
  city: string;
  createdAt: string;
  amountCents?: number;
  /** Customer-facing total charged (cents), includes tip after checkout */
  chargedTotalCents?: number;
  tipCents?: number;
  paymentStatus?: PaymentStatus;
  payoutStatus?: PayoutStatus;
  stripePaymentIntentId?: string;
  zip?: string;
  /** Full street + city for job UI */
  addressLine?: string;
  customerName?: string;
  providerName?: string;
  providerPhotoUrl?: string;
  providerRating?: number;
  /** ISO time when driver is expected (ETA) */
  etaAt?: string;
  etaMinutes?: number;
  completedAt?: string;
  acceptedAt?: string;
  cancelledAt?: string;
  reviewSubmittedAt?: string;
  /** Drivers who dismissed this job from their feed */
  declinedByUids?: string[];
  /** Admin / server only — never expose to customer or driver UI */
  platformFeeCents?: number;
  /** Step key → photo URL (Firebase Storage) */
  jobPhotos?: Record<string, string>;
  notes?: string;
  /** Driver payout in cents (never show platform fee in UI). */
  providerPayoutCents?: number;
  /** Snapshot of booking form for support / display */
  bookingDetails?: Record<string, unknown>;
  /** Admin dispute / support — stop messaging */
  threadLocked?: boolean;
};

export type WalletTx = {
  id: string;
  uid: string;
  label: string;
  amountCents: number;
  kind: "credit" | "debit";
  category:
    | "job"
    | "points"
    | "interest"
    | "payment"
    | "cashout"
    | "card"
    | "other";
  createdAt: string;
  icon?: string;
};

export type DriverTier = "starter" | "bronze" | "silver" | "gold";

export type GriddNotification = {
  id: string;
  userId: string;
  event: string;
  title: string;
  body: string;
  icon?: string;
  color?: string;
  read: boolean;
  createdAt: string;
};

export type PorchPostType = "post" | "review" | "debate" | "shoutout" | "announcement";

export type PorchPost = {
  id: string;
  type: PorchPostType;
  title: string;
  body: string;
  authorUid: string;
  authorName: string;
  authorRole: UserRole | "provider";
  createdAt: string;
  rating?: number;
  pinned?: boolean;
  /** debate vote tallies */
  votes?: { yes: number; no: number };
  likeUids?: string[];
  commentCount?: number;
  jobId?: string;
  providerUid?: string;
};

export type JobChatMessage = {
  id: string;
  jobId: string;
  senderUid: string;
  senderRole: "customer" | "driver" | "admin";
  text: string;
  createdAt: string;
  smsSent?: boolean;
  readByUids?: string[];
};

export type Provider = {
  uid: string;
  name: string;
  city: string;
  zip?: string;
  /** Provider availability for matching */
  status?: "active" | "idle" | "busy" | "offline";
  rating: number;
  photoUrl?: string;
  etaMinutes?: number;
  serviceIds?: string[];
  driverTier?: DriverTier;
  stripeConnectId?: string;
  /** Lifetime completed jobs (driver stats) */
  completedJobCount?: number;
  /** Lifetime earnings in cents */
  lifetimeEarningsCents?: number;
  /** Stripe Connect onboarding complete */
  bankConnected?: boolean;
  blocked?: boolean;
  /** Admin / ops — identity verified */
  verified?: boolean;
  suspendedUntil?: string;
  email?: string;
  /** Driver onboarding: CEO review pipeline */
  verificationStatus?:
    | "awaiting_documents"
    | "pending"
    | "approved"
    | "rejected";
  /** License, vehicle, insurance, profile — URLs + fields */
  documents?: ProviderDocuments;
  /** ISO string or Firestore Timestamp from client */
  submittedAt?: string | unknown;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string | null;
};

/** Firestore `providers/{uid}.documents` */
export type ProviderDocuments = {
  licenseFront?: string;
  licenseBack?: string;
  insurance?: string;
  profilePhoto?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  licenseState?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  licensePlate?: string;
  plateState?: string;
  insuranceProvider?: string;
  policyNumber?: string;
  insuranceExpiry?: string;
  serviceZip?: string;
  maxDistanceMiles?: number;
  serviceIds?: string[];
};

