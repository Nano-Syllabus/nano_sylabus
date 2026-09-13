/**
 * Every cache key in the app, in one place.
 *
 * WHY A FACTORY RATHER THAN INLINE ARRAYS
 * ---------------------------------------
 * A TanStack Query key is a prefix tree: `["chat","sessions",{q:"x"}]` is
 * invalidated by `["chat","sessions"]` and by `["chat"]`. That property is the
 * whole invalidation story for this app — after a mutation you want to say
 * "every chat session list is stale now" without knowing which search terms or
 * page offsets happen to be cached. That only works if the prefixes are
 * spelled identically at every call site, and a hand-written array in forty
 * components is forty chances to type `"sessions"` where the rest of the app
 * says `"session"` and quietly get a cache that never invalidates.
 *
 * The shape is always: domain -> collection -> parameters. Parameters go last
 * and in an object, because a key is compared by deep structural equality with
 * object keys sorted — so `{limit:12, q:"a"}` and `{q:"a", limit:12}` are the
 * same entry, which is what you want, whereas positional arguments would not be.
 *
 * `as const` on every return keeps the tuple types literal, so
 * `queryKey: keys.chat.sessions.list(...)` narrows rather than widening to
 * `string[]`.
 */

export const keys = {
  /** The signed-in user's own account row, language and credit balance. */
  account: {
    all: () => ["account"] as const,
    detail: () => ["account", "detail"] as const,
    credits: () => ["account", "credits"] as const,
    language: () => ["account", "language"] as const,
  },

  chat: {
    all: () => ["chat"] as const,
    sessions: {
      all: () => ["chat", "sessions"] as const,
      /**
       * The sidebar history list. Paged, and searched with a debounced term —
       * both live in the key so switching back to a term you already typed is
       * a cache read rather than a request.
       */
      list: (params: { q?: string; limit?: number }) =>
        ["chat", "sessions", "list", params] as const,
      detail: (sessionId: string) => ["chat", "sessions", "detail", sessionId] as const,
    },
    /** Messages of one session. */
    session: (sessionId: string) => ["chat", "session", sessionId] as const,
  },

  /** The published subject catalog from the tenant API. Slow, and barely changes. */
  tenant: {
    all: () => ["tenant"] as const,
    catalog: () => ["tenant", "catalog"] as const,
    subjects: (params: { semester?: string; namespace?: string } = {}) =>
      ["tenant", "subjects", params] as const,
  },

  student: {
    all: () => ["student"] as const,
    courses: () => ["student", "courses"] as const,
    classrooms: () => ["student", "classrooms"] as const,
    materials: (params: { subject?: string } = {}) => ["student", "materials", params] as const,
    material: (documentId: string) => ["student", "material", documentId] as const,
    profileSubjects: () => ["student", "profile", "subjects"] as const,
    activeCommunity: () => ["student", "active-community"] as const,
    /** The Daily Dashboard, scoped only to the selected community. */
    dashboard: (community?: string) => ["student", "dashboard", "v2", community ?? ""] as const,
    calendarMonth: (community: string | undefined, month: string) =>
      ["student", "calendar", community ?? "", month] as const,
    teacherExams: () => ["student", "teacher-exams"] as const,
    practice: {
      all: () => ["student", "practice"] as const,
      topics: (subject: string) => ["student", "practice", "topics", subject] as const,
      attempts: (params: { subject?: string; limit?: number } = {}) =>
        ["student", "practice", "attempts", params] as const,
      attempt: (attemptId: string) => ["student", "practice", "attempt", attemptId] as const,
      mcqSet: (setId: string) => ["student", "practice", "mcq", setId] as const,
    },
    challenges: {
      all: () => ["student", "challenges"] as const,
      progress: (challengeId: string) =>
        ["student", "challenges", "progress", challengeId] as const,
      prerequisites: (challengeId: string, topicKey: string) =>
        ["student", "challenges", "prerequisites", challengeId, topicKey] as const,
    },
  },

  notes: {
    all: () => ["notes"] as const,
    list: (params: { q?: string; limit?: number } = {}) => ["notes", "list", params] as const,
    detail: (noteId: string) => ["notes", "detail", noteId] as const,
    revisionLog: () => ["notes", "revision-log"] as const,
  },

  billing: {
    all: () => ["billing"] as const,
    invoices: () => ["billing", "invoices"] as const,
    payments: () => ["billing", "payments"] as const,
    plans: () => ["billing", "plans"] as const,
    credits: () => ["billing", "credits"] as const,
    coupons: () => ["billing", "coupons"] as const,
    referrals: () => ["billing", "referrals"] as const,
  },

  communities: {
    all: () => ["communities"] as const,
    list: () => ["communities", "list"] as const,
    detail: (slug: string) => ["communities", "detail", slug] as const,
    hub: (slug: string) => ["communities", "hub", slug] as const,
    membership: (slug: string) => ["communities", "membership", slug] as const,
    subjects: (slug: string) => ["communities", "subjects", slug] as const,
    subjectPosts: (slug: string, subjectId: string) =>
      ["communities", "subject-posts", slug, subjectId] as const,
  },

  teacher: {
    all: () => ["teacher"] as const,
    dashboard: () => ["teacher", "dashboard"] as const,
    courses: () => ["teacher", "courses"] as const,
    classrooms: () => ["teacher", "classrooms"] as const,
    classroom: (classroomId: string) => ["teacher", "classroom", classroomId] as const,
    subjects: () => ["teacher", "subjects"] as const,
    subject: (slug: string) => ["teacher", "subject", slug] as const,
    exams: () => ["teacher", "exams"] as const,
    exam: (paperId: string) => ["teacher", "exams", paperId] as const,
    workspace: () => ["teacher", "workspace"] as const,
    preferences: () => ["teacher", "preferences"] as const,
    job: (jobId: string) => ["teacher", "job", jobId] as const,
  },

  admin: {
    all: () => ["admin"] as const,
    analytics: (params: { range?: string } = {}) => ["admin", "analytics", params] as const,
    users: (params: Record<string, string | number | undefined> = {}) =>
      ["admin", "users", params] as const,
    answers: (params: Record<string, string | number | undefined> = {}) =>
      ["admin", "answers", params] as const,
    payments: (params: Record<string, string | number | undefined> = {}) =>
      ["admin", "payments", params] as const,
    subscriptions: {
      plans: () => ["admin", "subscriptions", "plans"] as const,
      userSubscriptions: (params: Record<string, string | number | undefined> = {}) =>
        ["admin", "subscriptions", "user-subscriptions", params] as const,
    },
  },

  /** Public, unauthenticated reads — safe to persist to disk and share. */
  public: {
    all: () => ["public"] as const,
    courses: () => ["public", "courses"] as const,
  },
} as const;

export type QueryKeys = typeof keys;
