export type UserRole = "customer" | "driver" | "ceo";

export type User = {
  uid: string;
  email?: string;
  phone?: string;
  name?: string;
  role: UserRole;
  griddScore?: number;
  griddTier?: string;
  scoreHistory?: { at: string; reason: string; delta: number }[];
  referralCode?: string;
  referredByUid?: string;
  appliedReferralCode?: string;
  agreementsSigned?: string[];
  createdAt: string;
  blocked?: boolean;
  /** Temporary suspension — ISO time after which login is allowed */
  suspendedUntil?: string;
  /** Customer / account — CEO hold / suspend (mirrors driver accountStatus) */
  accountStatus?: "active" | "on_hold" | "suspended" | "banned";
  holdReason?: string;
  banned?: boolean;
  banReason?: string;
  bannedAt?: unknown;
  bannedBy?: string | null;
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
  /** Primary service location (open-market matching / maps). */
  pickup?: { address: string; lat: number; lng: number };
  dropoff?: { address: string; lat: number; lng: number } | null;
  distanceMiles?: number | null;
  estimatedMinutes?: number | null;
  customerPhotoUrl?: string | null;
  customerRatingSnapshot?: number | null;
  driverLocation?: { lat: number; lng: number } | null;
  driverLocationUpdatedAt?: string | unknown;
  awaitingRating?: boolean;
  customerRatedDriver?: boolean;
  driverRatedCustomer?: boolean;
  /** 1–5 when submitted */
  customerToDriverStarRating?: number | null;
  driverToCustomerStarRating?: number | null;
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
  /** Customer unread chat messages (denormalized from chat) */
  unreadCount?: number;
  lastMessage?: string;
  lastMessageAt?: string;
  /** List price in cents when Smart Discount reduced the price */
  listedPriceCents?: number;
  /** Smart discount applied in cents (e.g. 300) */
  smartDiscountCents?: number;
  /** Internal trigger reason (mirrors `discounts` log) */
  smartDiscountRule?: string;
  /** BINTA GRIDD VAULT — auto-deposit (cents) on complete */
  bintaVaultDepositedCents?: number;
  bintaVaultTransactionId?: string;
  bintaVaultAt?: string;
  /** Last-mile sync — Shipday order id after paid job is pushed */
  shipdayOrderId?: number;
  shipdaySyncedAt?: string;
  shipdayLastEvent?: string;
  shipdayOrderStatus?: string;
  shipdayWebhookAt?: string;
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
    | "transfer_in"
    | "transfer_out"
    | "other";
  createdAt: string;
  icon?: string;
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  peerUid?: string;
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
  /** Legacy posts may use `admin`; displayed as CEO */
  authorRole: UserRole | "provider" | "admin";
  createdAt: string;
  /** Display category tag (often mirrors type or "general") */
  category?: string;
  authorPhoto?: string | null;
  rating?: number;
  pinned?: boolean;
  /** debate vote tallies */
  votes?: { yes: number; no: number };
  /** @deprecated prefer `likes` — kept for older documents */
  likeUids?: string[];
  /** User ids who liked (canonical) */
  likes?: string[];
  /** User ids who used ‼️ GRIDD IT */
  griddit?: string[];
  likeCount?: number;
  gridditCount?: number;
  commentCount?: number;
  jobId?: string;
  providerUid?: string;
  /** Optional human-readable job / meetup location */
  jobLocation?: string;
  updatedAt?: unknown;
  edited?: boolean;
  /** Set when post has been reported enough times to leave the public feed */
  hiddenFromFeed?: boolean;
  /** Denormalized count of reports (server-maintained) */
  reportCount?: number;
  /** Soft delete — post hidden from feed; retained for safety / CEO review */
  deleted?: boolean;
  deletedAt?: unknown;
  deletedByUid?: string;
  zipCode?: string | null;
  neighborhood?: string | null;
  lat?: number | null;
  lng?: number | null;
  authorGriddScore?: number;
  distanceMiles?: number;
};

/** `driverLounge/main/messages/{msgId}` */
export type DriverLoungeMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  senderRating?: number;
  text: string;
  createdAt: unknown;
  likes: string[];
  likeCount?: number;
  deleted: boolean;
};

/** Firestore `reports/{reportId}` — reportId is `{reportedBy}_{postId}` */
export type PorchReportDoc = {
  postId: string;
  reportedUserId: string;
  reportedBy: string;
  reporterName: string;
  reason: string;
  details?: string;
  createdAt?: unknown;
  status?: "pending" | "dismissed";
  postContent: string;
  dismissedAt?: unknown;
  dismissedBy?: string;
};

/** Firestore `conversations/{conversationId}` — id from `makeConversationId(uidA, uidB)` */
export type DmConversation = {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  participantPhotos: Record<string, string | null | undefined>;
  lastMessage: string;
  lastMessageAt: unknown;
  lastMessageBy: string;
  unreadCount: Record<string, number>;
  createdAt: unknown;
  isBlocked?: boolean;
  blockedBy?: string | null;
  /** UIDs who removed thread from their inbox (soft delete) */
  hiddenForUsers?: string[];
  /** Approximate count of messages in thread (incremented on send). */
  messageCount?: number;
  /** uid → currently typing */
  typing?: Record<string, boolean>;
};

/** `conversations/{id}/messages/{msgId}` */
export type DmMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string | null;
  createdAt: unknown;
  read: boolean;
  readAt: unknown | null;
  deleted: boolean;
  /** UIDs who hid this message in their own view (soft hide; content retained for safety review). */
  hiddenForUserIds?: string[];
};

/** Subcollection: porch/{postId}/comments/{commentId} */
export type PorchComment = {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  text: string;
  createdAt: unknown;
  likes?: string[];
  likeCount?: number;
  /** Set for one level of threading; top-level comments omit or null */
  parentCommentId?: string | null;
};

export type JobChatMessage = {
  id: string;
  jobId: string;
  senderUid: string;
  /** Legacy chats may still have `admin`; treat like CEO in UI */
  senderRole: "customer" | "driver" | "ceo" | "admin";
  text: string;
  createdAt: string;
  smsSent?: boolean;
  readByUids?: string[];
  /** Image shared in chat */
  attachmentUrl?: string;
};

export type DriverAccountStatus =
  | "pending_review"
  | "pending"
  | "more_info_needed"
  | "approved"
  | "rejected"
  /** CEO demo trial — marketplace access with job cap */
  | "demo"
  | "on_hold"
  | "suspended"
  | "banned";

export type Provider = {
  uid: string;
  name: string;
  /** Driver contact — mirrored from onboarding */
  phone?: string;
  city: string;
  zip?: string;
  griddScore?: number;
  griddTier?: string;
  scoreHistory?: { at: string; reason: string; delta: number }[];
  referralCode?: string;
  /** All required uploads completed (hard gate) */
  documentsSubmitted?: boolean;
  /** Account gate — CEO-controlled lifecycle */
  accountStatus?: DriverAccountStatus;
  /** CEO approval flag — required with accountStatus approved */
  approvedByCEO?: boolean;
  approvedAt?: string | unknown;
  approvedBy?: string;
  rejectedAt?: string | unknown;
  /** CEO note when more_info_needed */
  requestNote?: string | null;
  /** Explicit online flag (optional; `status` is primary for feed) */
  isOnline?: boolean;
  /** Current accepted job — one gig at a time */
  activeJob?: string | null;
  /** Provider availability — GRIDD: `on_the_gridd` / `off_gridd`; legacy: active/idle/offline */
  status?: "on_the_gridd" | "off_gridd" | "active" | "idle" | "busy" | "offline";
  /** Last known ZIP for demand / Pulse (optional; may mirror `zip`) */
  currentZip?: string;
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
  /** Suspension end (ISO) — used with accountStatus suspended */
  suspendedUntil?: string;
  suspensionReason?: string | null;
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
  /** In-app intro slides finished (`/onboarding`) */
  onboardingComplete?: boolean;
  /** CEO-granted trial — marketplace access without full approval (see driver-gate) */
  demoMode?: boolean;
  demoJobsUsed?: number;
  demoJobsLimit?: number;
  demoActivatedAt?: string | unknown;
  demoActivatedBy?: string | null;
  /** Live map — updated by driver client when online */
  location?: { lat: number; lng: number } | null;
  lastLocationUpdate?: unknown;
  /** FCM device token (web) for job alerts */
  fcmToken?: string | null;
  fcmUpdatedAt?: unknown;
  /** New onboarding pipeline (2 = stepped wizard + strict CEO approval for marketplace). Legacy omit / 1. */
  driverFlowVersion?: number;
  /** Driver wizard progress (steps 2–7); 8 after successful submit */
  driverWizardStep?: number;
  driverWizardSubmitted?: boolean;

  /** End-of-coverage dates (Firestore Timestamp or ISO?) — used by cron */
  commercialAutoExpiry?: unknown;
  personalAutoExpiry?: unknown;
  licenseExpiryDate?: unknown;
  registrationExpiryDate?: unknown;
  /** CEO review / back-office */
  ceoInsuranceExpiryNote?: string;
  ceoPolicyNumberNote?: string;
  agreedToCommercialInsuranceTermsAt?: unknown;
  commercialInsuranceReminded30dAt?: unknown;
  commercialInsuranceReminded7dAt?: unknown;
  /** CEO hold / suspend */
  holdReason?: string | null;
  banReason?: string | null;
  bannedAt?: unknown;
  bannedBy?: string | null;
  banned?: boolean;
};

/** Firestore `providers/{uid}.documents` — URLs under Storage `drivers/{uid}/documents/` */
export type ProviderDocuments = {
  /** Government ID */
  idFront?: string;
  idBack?: string;
  licenseFront?: string;
  licenseBack?: string;
  /** Personal / standard auto policy card */
  insurance?: string;
  /** Commercial auto or commercial-use endorsement declarations */
  commercialAuto?: string;
  /** Expiry of commercial coverage (YYYY-MM-DD) */
  commercialAutoExpiry?: string;
  /** Vehicle registration */
  registration?: string;
  /** Registration expiry (YYYY-MM-DD) */
  registrationExpiry?: string;
  /** Live selfie / verification */
  selfie?: string;
  /** Signed background check consent (image or PDF) */
  backgroundConsent?: string;
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
  /** CEO manual license verification */
  licenseVerified?: boolean;
  /** Four exterior angles for verification */
  vehiclePhotoFront?: string;
  vehiclePhotoRear?: string;
  vehiclePhotoDriverSide?: string;
  vehiclePhotoPassengerSide?: string;
};

