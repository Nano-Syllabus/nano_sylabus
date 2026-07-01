export type Language = "EN" | "RN";
export type AnswerStyle = "simple" | "balanced" | "detailed";
export type NoteColor = "red" | "yellow" | "green";
export type RevisionAction = "remember" | "review" | "skip";
export type AppRole = "student" | "admin";
export type MessageFeedback = "up" | "down";
export type AdminAnswerState = "flagged" | "reviewed" | "liked" | "neutral";
export type AdminAnswerFilter = AdminAnswerState | "all";
export type CitationSourceType = "syllabus" | "textbook" | "general";
export type CreditLedgerType = "grant" | "usage" | "refund" | "adjustment";
export type ReferenceType =
  | "starter_grant"
  | "chat_message"
  | "invoice"
  | "manual_adjustment";
export type BillingType = "one_time" | "monthly";
export type PaymentMethod = "esewa" | "khalti" | "bank_transfer";
export type InvoiceStatus =
  | "pending_payment"
  | "payment_submitted"
  | "paid"
  | "rejected"
  | "cancelled";
export type PaymentSubmissionStatus = "submitted" | "approved" | "rejected";
export type UserSubscriptionStatus = "pending" | "active" | "expired" | "cancelled";

export interface AssistantCitation {
  chunkId: string;
  documentId: string;
  sourceType?: CitationSourceType;
  sourceLabel: string;
  sourceTitle: string;
  sourceName: string;
  subject: string;
  chapter: string | null;
  topic: string | null;
  excerpt?: string;
}

export interface AssistantAnswerTrace {
  routePath: string;
  routeScopeDebug: string | null;
  retrievalMode: "default" | "web";
  answerMode: string | null;
  answerModeReason: string | null;
  matchedScope: string | null;
  answerModel: string | null;
  grounded: boolean;
  citationCount: number;
  lookupMs: number;
  generationMs: number;
  rewriteMs: number;
  followupMs: number;
  totalMs: number;
}

export interface StudentProfile {
  userId: string;
  fullName: string;
  college: string;
  board: string;
  grade: string;
  boardScore: string | null;
  subjects: string[];
  targetGrade: string;
  languagePref: Language;
  role: AppRole;
  createdAt: string;
  updatedAt: string;
}

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  onboarded: boolean;
  role: AppRole;
  creditBalance: number;
}

export interface ChatSessionSummary {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  subjectTags: string[];
  subjectContext: string | null;
  isPinned: boolean;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  language: Language;
  createdAt: string;
  grounded: boolean;
  citations: AssistantCitation[];
  feedback: MessageFeedback | null;
  followUpSuggestions: string[];
  savedNoteId: string | null;
  answerTrace: AssistantAnswerTrace | null;
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ChatMessageRecord[];
}

export interface SubjectExplorerSummary {
  subject: string;
  board: string;
  grade: string;
  category: "Science" | "Humanities" | "Management" | "Technical" | "General";
  inProfile: boolean;
  sessionCount: number;
  questionCount: number;
  lastActivityAt: string | null;
}

export interface SubjectExplorerSessionSummary extends ChatSessionSummary {
  turnCount: number;
  language: Language;
}

export interface RevisionNoteSummary {
  id: string;
  userId: string;
  sessionId: string;
  messageId: string;
  title: string;
  subjectTag: string;
  chapterTag: string | null;
  annotation: string | null;
  colorLabel: NoteColor;
  createdAt: string;
  updatedAt: string;
  questionContent: string;
  answerContent: string;
  reviewedCount: number;
  lastReviewedAt: string | null;
}

export interface RevisionNoteDetail extends RevisionNoteSummary {
  citations: AssistantCitation[];
}

export interface NoteRevisionLog {
  id: string;
  noteId: string;
  userId: string;
  action: RevisionAction;
  revisedAt: string;
}

export interface CreditsLedgerEntry {
  id: string;
  userId: string;
  type: CreditLedgerType;
  amount: number;
  balanceAfter: number;
  referenceType: ReferenceType;
  referenceId: string;
  description: string | null;
  createdAt: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  credits: number;
  price: number;
  currency: string;
  billingType: BillingType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  invoiceId: string | null;
  status: UserSubscriptionStatus;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  userId: string;
  planId: string;
  status: InvoiceStatus;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSubmission {
  id: string;
  invoiceId: string;
  userId: string;
  reference: string;
  proofMeta: {
    payerName?: string;
    screenshotUrl?: string;
    note?: string;
  } | null;
  status: PaymentSubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface BillingInvoiceSummary extends Invoice {
  plan: SubscriptionPlan;
  paymentSubmission: PaymentSubmission | null;
}

export interface StudentBillingOverview {
  balance: number;
  plans: SubscriptionPlan[];
  invoices: BillingInvoiceSummary[];
  subscriptions: UserSubscription[];
}

export interface AdminPaymentSubmissionSummary {
  id: string;
  invoiceId: string;
  userId: string;
  studentName: string;
  planName: string;
  planCredits: number;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  reference: string;
  status: PaymentSubmissionStatus;
  invoiceStatus: InvoiceStatus;
  submittedAt: string;
}

export interface AdminPaymentSubmissionDetail extends AdminPaymentSubmissionSummary {
  screenshotUrl: string | null;
  payerName: string | null;
  note: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface AdminUserSummary {
  userId: string;
  email: string;
  fullName: string;
  college: string;
  board: string;
  grade: string;
  role: AppRole;
  onboarded: boolean;
  creditBalance: number;
  activePlanName: string | null;
  chatSessionCount: number;
  noteCount: number;
  createdAt: string;
  lastSignInAt: string | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  boardScore: string | null;
  subjects: string[];
  targetGrade: string;
  languagePref: Language;
  recentLedger: CreditsLedgerEntry[];
  recentSubscriptions: UserSubscription[];
  recentInvoices: BillingInvoiceSummary[];
  recentSessions: Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
}

export interface AdminSubscriptionSummary extends UserSubscription {
  studentName: string;
  studentEmail: string;
  planName: string;
  planSlug: string;
  planCredits: number;
}

export interface AdminAnswerSummary {
  messageId: string;
  sessionId: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  college: string;
  board: string;
  grade: string;
  subjectContext: string | null;
  sessionTitle: string;
  answerPreview: string;
  feedback: MessageFeedback | null;
  grounded: boolean;
  citationCount: number;
  status: AdminAnswerState;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  adminReviewNote: string | null;
}

export interface AdminAnswerDetail extends AdminAnswerSummary {
  content: string;
  language: Language;
  citations: AssistantCitation[];
  subjects: string[];
  targetGrade: string;
  languagePref: Language;
  conversation: ChatMessageRecord[];
  answerTrace: AssistantAnswerTrace | null;
}

export interface AdminAnswerHealthBreakdownItem {
  label: string;
  count: number;
}

export interface AdminAnswerHealthSnapshot {
  sampleSize: number;
  groundedRate: number;
  reviewedRate: number;
  avgTotalMs: number;
  avgGenerationMs: number;
  latestCapturedAt: string | null;
  routeBreakdown: AdminAnswerHealthBreakdownItem[];
  modelBreakdown: AdminAnswerHealthBreakdownItem[];
}

export interface AdminListPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
