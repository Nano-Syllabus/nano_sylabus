"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import {
  canonicalUniversity,
  communityInputSchema,
  communityLevel,
  communityLevels,
  generateCommunityTerms,
  type CommunitySummary,
} from "@/lib/communities";
import { titleCase } from "@/lib/utils";
import { forgetCommunityScopedCaches } from "@/lib/query/membership";
import { getPhoneNumberError, normalizePhoneNumber } from "@/lib/phone-number";
import type { ChallengeQuestionFormat } from "@/lib/challenge-format";
import { CommunitySwitchDialog, type SwitchCommunity } from "@/components/community-switch-dialog";

// The create form offers only the two plain formats; hybrid stays available in
// the community's settings picker.
const createFormatOptions: { format: ChallengeQuestionFormat; label: string }[] = [
  { format: "qna", label: "QnA" },
  { format: "mcq", label: "MCQ" },
];

type Draft = {
  phoneNumber: string;
  university: string;
  level: string;
  faculty: string;
  description: string;
  totalYears: string;
  totalSemesters: string;
  /** Empty until the creator picks one — the form must not choose for them. */
  challengeQuestionFormat: string;
};

/** The bodies a community can be created under; the value is what gets stored. */
/**
 * What the phone field says back while the creator types: a Nepali number, a
 * number from another country, or nothing yet (the error covers bad input).
 */
function describePhoneNumber(value: string) {
  const normalized = normalizePhoneNumber(value);
  if (!normalized || getPhoneNumberError(value)) return null;
  return normalized.startsWith("+977")
    ? { nepal: true, text: `Nepal number · ${normalized}` }
    : { nepal: false, text: `Not a Nepal number · ${normalized}` };
}

const communityUniversities = [
  { value: "Tribhuvan University", label: "Tribhuvan University (TU)" },
  { value: "National Examination Board", label: "National Examination Board (NEB)" },
];

const emptyDraft: Draft = {
  phoneNumber: "",
  university: "",
  level: "",
  faculty: "",
  description: "",
  totalYears: "4",
  totalSemesters: "8",
  challengeQuestionFormat: "",
};


const cardTints = ["blue", "mint", "purple", "amber", "rose"] as const;

/** Stable tint per community, so a card keeps its colour across pages and filters. */
function communityTint(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  return cardTints[Math.abs(hash) % cardTints.length];
}

/** "BCT", "CSIT", "MBA" when the name carries an acronym, otherwise initials. */
function communityMonogram(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const acronym = words.find((word) => /^[A-Z]{2,4}$/.test(word));
  if (acronym) return acronym;
  return (words.length > 1 ? words.slice(0, 3).map((word) => word[0]).join("") : name.slice(0, 3))
    .toUpperCase() || "NS";
}

/** Each form row rises in, a beat after the one above. */
const fieldReveal = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" as const } },
};

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function CommunityCard({
  community,
  signedIn,
  currentCommunity,
}: {
  community: CommunitySummary;
  signedIn: boolean;
  /** The faculty this student already joined (not one they created), if any. */
  currentCommunity: SwitchCommunity | null;
}) {
  const router = useRouter();
  const joined = community.membership?.status === "active";
  const creator = joined && community.membership?.role === "creator";
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [switchFrom, setSwitchFrom] = useState<SwitchCommunity | null>(null);

  function openJoined() {
    router.push(`/flow?community=${encodeURIComponent(community.slug)}`);
    router.refresh();
  }


  async function joinCommunity() {
    // Already in another faculty: ask to switch rather than let the join fail.
    if (currentCommunity && currentCommunity.slug !== community.slug) {
      setSwitchFrom(currentCommunity);
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      const response = await fetch(
        `/api/communities/${encodeURIComponent(community.slug)}/join`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        current?: SwitchCommunity;
      };
      if (response.status === 409 && payload.current) {
        setSwitchFrom(payload.current);
        return;
      }
      if (!response.ok) {
        setJoinError(payload.error || "Could not join this community. Please try again.");
        return;
      }
      forgetCommunityScopedCaches();
      openJoined();
    } catch {
      setJoinError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setJoining(false);
    }
  }

  const actionLabel = joined ? "Open" : "Join";

  return (
    <article className={`ns-fc ns-fc--${communityTint(community.slug)}`}>
      <div className="ns-fc-inner">
        <div className="ns-fc-top">
          <div className="ns-fc-monogram" aria-hidden="true">
            {communityMonogram(community.name)}
          </div>
          <span className="ns-fc-tag">{communityLevel(community)}</span>
        </div>

        <div>
          <h3 className="ns-fc-title">
            {titleCase(community.name)}
            {creator ? (
              <span className="ns-fc-badge">★ Creator</span>
            ) : joined ? (
              <span className="ns-fc-badge">✓ Joined</span>
            ) : null}
          </h3>
          <p className="ns-fc-subtitle">
            {[community.faculty, community.university].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="ns-fc-meta">
          <span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M7 3v4M17 3v4M3 10h18" />
            </svg>
            {plural(community.totalYears, "year")}
            {community.totalSemesters ? ` · ${plural(community.totalSemesters, "semester")}` : ""}
          </span>
          {community.subjectCount ? (
            <span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z" />
              </svg>
              <strong>{plural(community.subjectCount, "subject")}</strong>
            </span>
          ) : null}
        </div>

        <div className="ns-fc-bottom">
          <div className="ns-fc-members">
            <span className="ns-fc-members-icon" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            </span>
            {plural(community.memberCount, "member")}
          </div>

          <div className="ns-fc-actions">
            {creator ? (
              <Link
                className="ns-fc-open"
                href={`/teachers?view=communities&community=${encodeURIComponent(community.slug)}`}
                aria-label={`Open ${community.name} admin workspace`}
              >
                {actionLabel} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
              </Link>
            ) : joined ? (
              <Link
                className="ns-fc-open"
                href={`/app/communities/${encodeURIComponent(community.slug)}`}
                aria-label={`Open ${community.name} community`}
              >
                {actionLabel} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
              </Link>
            ) : signedIn ? (
              <button
                type="button"
                className="ns-fc-open"
                onClick={joinCommunity}
                disabled={joining}
                aria-busy={joining}
                aria-label={`Join ${community.name}`}
              >
                {actionLabel}
                {joining ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg></>}
              </button>
            ) : (
              <Link
                className="ns-fc-open"
                href={`/flow?community=${encodeURIComponent(community.slug)}`}
                aria-label={`Join ${community.name}`}
              >
                {actionLabel} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
              </Link>
            )}
          </div>
        </div>

        <CommunitySwitchDialog
          open={Boolean(switchFrom)}
          from={switchFrom}
          to={{ slug: community.slug, name: community.name, university: community.university }}
          onClose={() => setSwitchFrom(null)}
          onSwitched={openJoined}
        />

        {joinError ? (
          <div className="ns-fc-error" role="alert">
            <p>{joinError}</p>
            <button type="button" onClick={joinCommunity} disabled={joining}>
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} style={{ marginTop: 6, fontSize: 12, color: "#dc2626" }}>
      {message}
    </p>
  ) : null;
}

export function CommunityCatalogClient({
  initialCommunities,
  signedIn,
  initialShowCreate = false,
  initialPhoneNumber = "",
}: {
  initialCommunities: CommunitySummary[];
  signedIn: boolean;
  initialShowCreate?: boolean;
  /** The signed-in creator's saved number, so they rarely retype it. */
  initialPhoneNumber?: string;
}) {
  const router = useRouter();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedUniversity, setSelectedUniversity] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  const [showCreate, setShowCreate] = useState(initialShowCreate);
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft, phoneNumber: initialPhoneNumber });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Dynamic filter options derived from initialCommunities + standard fallbacks
  const availableUniversities = useMemo(() => {
    const set = new Set<string>();
    initialCommunities.forEach((c) => {
      if (c.university) set.add(canonicalUniversity(c.university));
    });
    ["Tribhuvan University", "Kathmandu University", "Pokhara University", "Purbanchal University"].forEach(
      (u) => set.add(u),
    );
    return Array.from(set);
  }, [initialCommunities]);

  const availableLevels = communityLevels;

  const currentCommunity = useMemo(() => {
    const current = initialCommunities.find(
      (c) => c.membership?.status === "active" && c.membership.role === "member",
    );
    return current ? { slug: current.slug, name: current.name, university: current.university } : null;
  }, [initialCommunities]);

  // Filter logic
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return initialCommunities
      .filter((community) => {
        const haystack = [
          community.name,
          community.university,
          community.faculty,
          community.description,
          communityLevel(community),
        ]
          .join(" ")
          .toLowerCase();

        const matchesSearch = !needle || haystack.includes(needle);

        const matchesUniversity =
          !selectedUniversity ||
          community.university.toLowerCase().includes(selectedUniversity.toLowerCase());

        const matchesLevel = !selectedLevel || communityLevel(community) === selectedLevel;

        return matchesSearch && matchesUniversity && matchesLevel;
      })
      .sort(
        (left, right) =>
          right.memberCount - left.memberCount || left.name.localeCompare(right.name),
      );
  }, [initialCommunities, query, selectedUniversity, selectedLevel]);

  // Pagination calculation
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, totalItems);
  const paginatedCommunities = filtered.slice(start, end);

  function clearAllFilters() {
    setQuery("");
    setSelectedUniversity("");
    setSelectedLevel("");
    setCurrentPage(1);
  }

  function goToPage(page: number) {
    setCurrentPage(page);
    document
      .querySelector(".ns-browse-intro")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const totalYears = Number.parseInt(draft.totalYears, 10) || 0;
  const totalSemesters = Number.parseInt(draft.totalSemesters, 10) || 0;
  const previewTerms =
    totalYears >= 1 && totalSemesters >= totalYears && totalSemesters <= totalYears * 4
      ? generateCommunityTerms(totalYears, totalSemesters)
      : [];

  function stepDraft(field: "totalYears" | "totalSemesters", delta: number, min: number, max: number) {
    const current = Number.parseInt(draft[field], 10) || min;
    updateDraft(field, String(Math.min(max, Math.max(min, current + delta))));
  }

  function updateDraft(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }

  function openCreate() {
    setShowCreate(true);
  }

  // Modal housekeeping: Escape closes, the page behind stops scrolling, and the
  // first field takes focus once the panel has started to settle.
  useEffect(() => {
    if (!showCreate) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 120);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) setShowCreate(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showCreate, submitting]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFieldErrors({});
    const { phoneNumber, ...fields } = draft;
    const phoneError = getPhoneNumberError(phoneNumber);
    const parsed = communityInputSchema.safeParse({
      ...fields,
      // No separate name field: the community is called by its programme.
      name: fields.faculty.trim().slice(0, 120),
      totalYears,
      totalSemesters,
      visibility: "public",
    });
    if (!parsed.success || phoneError) {
      const errors: Record<string, string> = {};
      if (phoneError) errors.phoneNumber = phoneError;
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        let field = String(issue.path[0] || "form");
        if (field === "name") field = "faculty";
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      const first = Object.keys(errors)[0];
      if (first) document.getElementById(`community-${first}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...parsed.data, phoneNumber: normalizePhoneNumber(phoneNumber) }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        community?: CommunitySummary;
        error?: string;
        field?: string;
      };
      if (!response.ok || !payload.community) {
        if (payload.field)
          setFieldErrors({
            [payload.field === "name" ? "faculty" : payload.field]: payload.error || "Check this value.",
          });
        else setFormError(payload.error || "Could not create the community. Try again.");
        return;
      }
      router.push(
        `/teachers?view=communities&community=${encodeURIComponent(payload.community.slug)}`,
      );
      router.refresh();
    } catch {
      setFormError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="ns-communities-page">
      <style jsx global>{`
        .ns-communities-page {
          width: min(1440px, calc(100% - 64px));
          margin: 0 auto;
          padding-bottom: 72px;
          color: #101114;
          background: #ffffff;
          font-family: var(--font-inter), Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        .ns-topbar {
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .ns-brand {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          color: #101114;
          text-decoration: none;
          font-family: var(--font-display);
          font-size: 1.375rem;
          font-weight: 600;
          letter-spacing: -0.04em;
        }

        .ns-brand-mark {
          width: 42px;
          height: 42px;
          flex: 0 0 auto;
        }

        .ns-top-cta,
        .ns-hero-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: 0;
          border-radius: 999px;
          color: white;
          background: #101114;
          text-decoration: none;
          font-weight: 700;
          transition: transform .18s ease, background .18s ease;
          cursor: pointer;
        }

        .ns-top-cta { min-height: 44px; padding: 0 21px; font-size: 15px; }
        .ns-hero-cta { min-height: 45px; padding: 0 23px; font-size: 15px; }

        .ns-top-cta:hover,
        .ns-hero-cta:hover { background: #26282d; transform: translateY(-1px); }

        .ns-clear-button:focus-visible,
        .ns-top-cta:focus-visible,
        .ns-hero-cta:focus-visible,
        .ns-page-button:focus-visible {
          outline: 2px solid #3049ed;
          outline-offset: 3px;
        }

        .ns-hero-cta--blue {
          background: #3049ed !important;
          min-height: 48px !important;
          padding: 0 24px !important;
          font-size: 14px !important;
          border-radius: 10px !important;
        }
        .ns-hero-cta--blue:hover { background: #2439d0 !important; }

        .ns-hero {
          min-height: 224px;
          padding: 40px 50px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 190px;
          align-items: center;
          gap: 32px;
          overflow: hidden;
          border-radius: 15px;
          background: #dcfa72;
        }

        .ns-hero h1 {
          margin: 0;
          max-width: 800px;
          font-family: var(--font-display);
          font-size: clamp(2.5rem, 3.2vw, 3.25rem);
          line-height: 1;
          letter-spacing: -0.045em;
          font-weight: 600;
          color: #101114;
        }

        .ns-hero p {
          margin: 14px 0 24px;
          color: #313329;
          font-size: 1.125rem;
          line-height: 1.5;
          font-weight: 400;
          letter-spacing: -0.01em;
        }

        .ns-hero-art {
          width: 150px;
          aspect-ratio: 1;
          justify-self: end;
          display: grid;
          place-items: center;
          border-radius: 28px;
          background: white;
        }

        .ns-hero-art svg { width: 96px; height: 96px; }

        .ns-discovery {
          margin-top: 30px;
          display: grid;
          grid-template-columns: 286px minmax(0, 1fr);
          gap: 28px;
          align-items: start;
        }

        /* Sleek Sidebar Filters */
        .ns-filters {
          padding: 20px;
          border: 1px solid #e5e8df;
          border-radius: 15px;
          background: #f5f7f1;
        }

        .ns-filters-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding-bottom: 16px;
          border-bottom: 1px solid #d6dbe3;
        }

        .ns-filters h2 {
          margin: 0;
          font-family: var(--font-display);
          font-size: 1.125rem;
          letter-spacing: -0.025em;
          font-weight: 600;
          color: #101114;
        }

        .ns-filters h2::before {
          content: "";
          display: inline-block;
          width: 8px;
          height: 8px;
          margin-right: 8px;
          border-radius: 999px;
          background: #3049ed;
          vertical-align: 2px;
        }

        .ns-clear-button {
          min-height: 40px;
          padding: 0 10px;
          border: 0;
          border-radius: 6px;
          color: #0a2ec3;
          background: #ebf1ff;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }

        .ns-clear-button:hover {
          color: #0a2ec3;
          background: #dce5ff;
        }

        .ns-filter-group {
          margin: 0;
          padding: 18px 0;
          border-bottom: 1px solid #e5e8df;
        }

        .ns-filter-group:last-child {
          padding-bottom: 0;
          border-bottom: 0;
        }

        .ns-filter-label {
          display: block;
          margin: 0 0 12px;
          padding: 0;
          font-size: 14px;
          font-weight: 750;
          letter-spacing: -0.01em;
          color: #101114;
        }

        .ns-filter-select { position: relative; }
        .ns-filter-select select {
          width: 100%;
          height: 44px;
          padding: 0 40px 0 14px;
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid #dfe3d8;
          border-radius: 10px;
          background: #ffffff;
          color: #101114;
          font: inherit;
          font-size: 14px;
          cursor: pointer;
          transition: border-color .18s ease, box-shadow .18s ease;
        }
        .ns-filter-select select:hover { border-color: #b9bfb0; }
        .ns-filter-select select:focus-visible {
          outline: none;
          border-color: #3049ed;
          box-shadow: 0 0 0 3px rgba(48, 73, 237, .15);
        }
        .ns-filter-select svg {
          position: absolute;
          right: 14px;
          top: 50%;
          width: 16px;
          height: 16px;
          transform: translateY(-50%);
          color: #606774;
          pointer-events: none;
        }

        /* Browse faculties — tinted community cards */
        .ns-browse {
          font-family: var(--font-dm-sans), var(--font-inter), ui-sans-serif, system-ui, sans-serif;
          color: #171c27;
        }
        .ns-browse button,
        .ns-browse input,
        .ns-browse select { font: inherit; }

        .ns-browse-intro {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
          scroll-margin-top: 24px;
        }
        .ns-browse-heading { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .ns-browse-intro h2 {
          margin: 0;
          font-family: var(--font-jakarta), var(--font-display), sans-serif;
          font-size: clamp(24px, 2.2vw, 30px);
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -.045em;
          white-space: nowrap;
        }
        .ns-browse-count {
          padding: 5px 10px;
          border-radius: 999px;
          background: #ebefff;
          color: #314acf;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .ns-browse-search { position: relative; flex: 0 1 300px; min-width: 0; }
        .ns-browse-search svg {
          position: absolute;
          left: 13px;
          top: 50%;
          transform: translateY(-50%);
          color: #8490a2;
          pointer-events: none;
        }
        .ns-browse-search input {
          width: 100%;
          height: 40px;
          padding: 0 12px 0 37px;
          border: 1px solid #e6e9f0;
          border-radius: 10px;
          background: #fff;
          color: #171c27;
          font-size: 14px !important;
          outline: none;
          transition: border-color .2s, box-shadow .2s;
        }
        .ns-browse-search input::placeholder { color: #9aa2b1; }
        .ns-browse-search input:focus { border-color: #a5b4fc; box-shadow: 0 0 0 3px #e9edff; }
        .ns-results { min-width: 0; }
        .ns-browse-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }

        .ns-fc {
          position: relative;
          min-height: 270px;
          overflow: hidden;
          border: 1px solid #e6e9f0;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 3px 8px rgba(22, 34, 71, .025);
          transition: transform .25s, box-shadow .25s, border-color .25s;
        }
        .ns-fc:hover { transform: translateY(-4px); box-shadow: 0 18px 38px rgba(31, 46, 91, .09); border-color: #cbd4fa; }
        .ns-fc:focus-within { border-color: #a5b4fc; }
        .ns-fc::before { content: ""; position: absolute; inset: 0 0 auto; height: 94px; background: var(--wash); }
        .ns-fc::after {
          content: "";
          position: absolute;
          width: 185px;
          height: 185px;
          right: -42px;
          top: -79px;
          border: 1px solid var(--arc);
          border-radius: 50%;
          box-shadow: 0 0 0 29px var(--halo), 0 0 0 58px var(--halo);
          pointer-events: none;
        }
        .ns-fc--blue { --wash: #eff3ff; --arc: #cedafa; --halo: #e7edff; --accent: #3158e9; }
        .ns-fc--mint { --wash: #eaf8f3; --arc: #bee9d8; --halo: #e1f4ed; --accent: #177d65; }
        .ns-fc--purple { --wash: #f3efff; --arc: #ded3fa; --halo: #ede7fb; --accent: #7454c5; }
        .ns-fc--amber { --wash: #fff4e7; --arc: #f6dfba; --halo: #fff0dc; --accent: #b46b1d; }
        .ns-fc--rose { --wash: #fff0f2; --arc: #f8d7dd; --halo: #ffebef; --accent: #c04d68; }

        .ns-fc-inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          min-height: 270px;
          padding: 24px 25px 23px;
        }
        .ns-fc-top { height: 74px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .ns-fc-monogram {
          display: grid;
          place-items: center;
          width: 55px;
          height: 55px;
          border: 1px solid rgba(255, 255, 255, .85);
          border-radius: 17px;
          background: #fff;
          box-shadow: 0 7px 18px rgba(31, 46, 91, .08);
          color: var(--accent);
          font-family: var(--font-jakarta), var(--font-display), sans-serif;
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -.04em;
        }
        .ns-fc-tag {
          padding: 7px 11px;
          border: 1px solid rgba(255, 255, 255, .9);
          border-radius: 999px;
          background: rgba(255, 255, 255, .74);
          color: var(--accent);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
          backdrop-filter: blur(5px);
        }
        .ns-fc-title {
          margin: 4px 0 5px;
          font-family: var(--font-jakarta), var(--font-display), sans-serif;
          font-size: 22px;
          font-weight: 800;
          line-height: 1.26;
          letter-spacing: -.04em;
          overflow-wrap: anywhere;
        }
        .ns-fc-badge {
          display: inline-flex;
          align-items: center;
          margin-left: 8px;
          padding: 5px 9px;
          border-radius: 999px;
          background: #e9f7ef;
          color: #23804e;
          font-family: var(--font-dm-sans), var(--font-inter), sans-serif;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0;
          vertical-align: 4px;
        }
        .ns-fc-subtitle { margin: 0; font-size: 14px; line-height: 1.45; color: #667083; }
        .ns-fc-meta { display: flex; flex-wrap: wrap; gap: 8px 15px; margin-top: 22px; font-size: 13px; color: #616b7d; }
        .ns-fc-meta span { display: inline-flex; align-items: center; gap: 6px; }
        .ns-fc-meta svg { color: #8290a9; }
        .ns-fc-meta strong { color: #384354; font-weight: 700; }
        .ns-fc-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: auto;
          padding-top: 21px;
        }
        .ns-fc-members { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: #6b7586; }
        .ns-fc-members-icon {
          display: grid;
          place-items: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--wash);
          color: var(--accent);
        }
        .ns-fc-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
        .ns-fc-open {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 10px 13px;
          border: 0;
          border-radius: 10px;
          background: #212b48;
          color: #fff;
          font-size: 13px !important;
          font-weight: 800 !important;
          text-decoration: none;
          white-space: nowrap;
          cursor: pointer;
          transition: background .2s, transform .2s;
        }
        .ns-fc-open:hover { background: #3158f4; transform: translateX(2px); }
        .ns-fc-open:disabled { cursor: wait; opacity: .7; }
        .ns-fc-open svg { width: 16px; height: 16px; }
        .ns-fc-open:focus-visible,
        .ns-browse-empty button:focus-visible { outline: 3px solid #9aafff; outline-offset: 3px; }
        .ns-fc-error {
          margin-top: 12px;
          padding: 8px 12px;
          border: 1px solid #fecaca;
          border-radius: 8px;
          background: #fef2f2;
          font-size: 12px;
          color: #b91c1c;
        }
        .ns-fc-error p { margin: 0; }
        .ns-fc-error button {
          margin-top: 4px;
          padding: 0;
          border: 0;
          background: none;
          color: #991b1b;
          font-weight: 600;
          text-decoration: underline;
          cursor: pointer;
        }

        .ns-browse-empty {
          padding: 60px 20px;
          border: 1px solid #e6e9f0;
          border-radius: 20px;
          background: #fff;
          text-align: center;
          color: #667083;
        }
        .ns-browse-empty h3 { margin: 0 0 8px; color: #171c27; font-size: 20px; font-weight: 700; }
        .ns-browse-empty p { margin: 0 0 18px; }
        .ns-browse-empty button {
          padding: 11px 18px;
          border: 0;
          border-radius: 9px;
          background: #3158f4;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }

        .ns-pagination-wrap {
          margin-top: 26px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .ns-page-summary {
          color: #606774;
          font-size: 14px;
          font-weight: 400;
        }

        .ns-pagination {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .ns-page-numbers { display: flex; align-items: center; gap: 7px; }

        .ns-page-button {
          min-width: 40px;
          height: 40px;
          padding: 0 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid #d6dbe3;
          border-radius: 10px;
          color: #101114;
          background: white;
          font-size: 14px;
          font-weight: 650;
          cursor: pointer;
          transition: border-color .18s ease, background .18s ease, color .18s ease;
        }

        .ns-page-button:hover:not(:disabled):not([aria-current="page"]) {
          border-color: #9ba2ad;
          background: #f6f7f9;
        }

        .ns-page-button[aria-current="page"] {
          border-color: #3049ed;
          color: white;
          background: #3049ed;
        }

        .ns-page-button:disabled { opacity: .38; cursor: not-allowed; }
        .ns-page-button svg { width: 16px; height: 16px; }

        /* Create-a-faculty modal */
        .ns-cf-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(12, 16, 30, .46);
          backdrop-filter: blur(3px);
        }
        .ns-cf {
          display: grid;
          grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr);
          width: 100%;
          max-width: 1000px;
          max-height: calc(100dvh - 32px);
          overflow: hidden;
          border-radius: 24px;
          background: #ffffff;
          box-shadow: 0 30px 80px rgba(12, 16, 30, .28), 0 0 0 1px rgba(12, 16, 30, .06);
          font-family: var(--font-dm-sans), var(--font-inter), ui-sans-serif, system-ui, sans-serif;
          color: #171c27;
          will-change: transform, opacity;
        }
        .ns-cf button,
        .ns-cf input { font: inherit; }

        .ns-cf-form { display: flex; flex-direction: column; min-height: 0; }
        .ns-cf-head {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 24px 28px 18px;
          border-bottom: 1px solid #eef0f5;
        }
        .ns-cf-mark {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 42px;
          height: 42px;
          border-radius: 13px;
          background: #eef2ff;
          color: #3158f4;
        }
        .ns-cf-mark svg { width: 22px; height: 22px; }
        .ns-cf-head-text { flex: 1; min-width: 0; }
        .ns-cf-head h2 {
          margin: 0;
          font-family: var(--font-jakarta), var(--font-display), sans-serif;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -.04em;
          line-height: 1.2;
        }
        .ns-cf-head p { margin: 4px 0 0; font-size: 14px; color: #667083; }
        .ns-cf-close {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border: 1px solid #e6e9f0;
          border-radius: 50%;
          background: #fff;
          color: #5b6578;
          cursor: pointer;
          transition: background .18s, color .18s, transform .18s;
        }
        .ns-cf-close:hover { background: #f4f6fa; color: #171c27; transform: rotate(90deg); }
        .ns-cf-close svg { width: 17px; height: 17px; }

        .ns-cf-body {
          display: grid;
          gap: 18px;
          padding: 22px 28px 24px;
          overflow-y: auto;
          overscroll-behavior: contain;
        }
        .ns-cf-alert {
          display: grid;
          gap: 2px;
          padding: 12px 14px;
          border: 1px solid #fecaca;
          border-radius: 12px;
          background: #fef2f2;
          font-size: 13px;
          color: #b91c1c;
        }
        .ns-cf-field { min-width: 0; margin: 0; padding: 0; border: 0; }
        .ns-cf-field:focus { outline: none; }
        .ns-cf-label {
          display: block;
          margin: 0 0 8px;
          padding: 0;
          font-size: 13px;
          font-weight: 700;
          color: #273041;
        }
        .ns-cf-hint { margin: 7px 0 0; font-size: 12px; color: #7a8394; }

        .ns-cf-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .ns-cf-select { position: relative; }
        .ns-cf-select select {
          width: 100%;
          height: 46px;
          padding: 0 40px 0 14px;
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid #e3e7ee;
          border-radius: 12px;
          background: #fff;
          color: #171c27;
          font: inherit;
          font-size: 14px;
          cursor: pointer;
          outline: none;
          transition: border-color .18s, box-shadow .18s;
        }
        .ns-cf-select select[data-empty] { color: #a0a8b6; }
        .ns-cf-select select option { color: #171c27; }
        .ns-cf-select select:hover { border-color: #c6cee0; }
        .ns-cf-select select:focus { border-color: #8da2fb; box-shadow: 0 0 0 4px #eaeeff; }
        .ns-cf-select select[aria-invalid="true"] { border-color: #f19aa6; }
        .ns-cf-select svg {
          position: absolute;
          right: 14px;
          top: 50%;
          width: 16px;
          height: 16px;
          transform: translateY(-50%);
          color: #5b6578;
          pointer-events: none;
        }

        .ns-cf-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .ns-cf-chips--wide { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .ns-cf-chip { position: relative; cursor: pointer; }
        .ns-cf-chip input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
        .ns-cf-chip span {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 16px;
          border: 1px solid #e3e7ee;
          border-radius: 12px;
          background: #fff;
          font-size: 14px;
          font-weight: 600;
          color: #3a4354;
          text-align: center;
          transition: border-color .18s, background .18s, color .18s, box-shadow .18s;
        }
        .ns-cf-chip:hover span { border-color: #c6cee0; background: #f8f9fc; }
        .ns-cf-chip input:checked + span {
          border-color: #3158f4;
          background: #eef2ff;
          color: #2440c9;
          box-shadow: inset 0 0 0 1px #3158f4;
        }
        .ns-cf-chip input:focus-visible + span { outline: 3px solid #b9c6ff; outline-offset: 2px; }

        .ns-cf-input,
        .ns-cf-stepper,
        .ns-cf-phone {
          width: 100%;
          height: 46px;
          border: 1px solid #e3e7ee;
          border-radius: 12px;
          background: #fff;
          transition: border-color .18s, box-shadow .18s;
        }
        .ns-cf-input { padding: 0 14px; font-size: 14px !important; color: #171c27; outline: none; }
        .ns-cf-input::placeholder,
        .ns-cf-phone input::placeholder { color: #a0a8b6; }
        .ns-cf-input:focus,
        .ns-cf-stepper:focus-within,
        .ns-cf-phone:focus-within { border-color: #8da2fb; box-shadow: 0 0 0 4px #eaeeff; }
        .ns-cf-input[aria-invalid="true"],
        .ns-cf-stepper[data-invalid],
        .ns-cf-phone[data-invalid] { border-color: #f19aa6; }

        .ns-cf-stepper { display: flex; align-items: stretch; overflow: hidden; }
        .ns-cf-stepper input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: none;
          background: transparent;
          text-align: center;
          font-size: 15px !important;
          font-weight: 700 !important;
          color: #171c27;
        }
        .ns-cf-stepper button {
          width: 48px;
          border: 0;
          background: #f6f7fb;
          color: #3a4354;
          font-size: 18px !important;
          font-weight: 600 !important;
          cursor: pointer;
          transition: background .15s, color .15s;
        }
        .ns-cf-stepper button:hover { background: #eef2ff; color: #3158f4; }
        .ns-cf-stepper button:focus-visible { outline: 3px solid #b9c6ff; outline-offset: -3px; }

        .ns-cf-phone { display: flex; align-items: center; gap: 10px; padding: 0 8px 0 14px; }
        .ns-cf-phone svg { width: 17px; height: 17px; flex: 0 0 auto; color: #8490a2; }
        .ns-cf-phone input {
          flex: 1;
          min-width: 0;
          height: 100%;
          border: 0;
          outline: none;
          background: transparent;
          font-size: 14px !important;
          color: #171c27;
        }
        .ns-cf-phone-badge {
          flex: 0 0 auto;
          padding: 5px 9px;
          border-radius: 999px;
          background: #fff4e5;
          color: #b45309;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .02em;
        }
        .ns-cf-phone-badge.is-nepal { background: #e9f7ef; color: #15803d; }

        .ns-cf-foot {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          margin-top: auto;
          padding: 16px 28px;
          border-top: 1px solid #eef0f5;
          background: #fbfcfe;
        }
        .ns-cf-cancel,
        .ns-cf-submit {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 44px;
          padding: 0 18px;
          border-radius: 12px;
          font-size: 14px !important;
          font-weight: 700 !important;
          cursor: pointer;
          transition: background .18s, transform .18s, border-color .18s;
        }
        .ns-cf-cancel { border: 1px solid #e3e7ee; background: #fff; color: #3a4354; }
        .ns-cf-cancel:hover { border-color: #c6cee0; }
        .ns-cf-submit { min-width: 170px; border: 0; background: #212b48; color: #fff; }
        .ns-cf-submit:hover:not(:disabled) { background: #3158f4; transform: translateY(-1px); }
        .ns-cf-submit:disabled,
        .ns-cf-cancel:disabled { opacity: .65; cursor: wait; }
        .ns-cf-submit svg { width: 16px; height: 16px; }
        .ns-cf-cancel:focus-visible,
        .ns-cf-submit:focus-visible,
        .ns-cf-close:focus-visible { outline: 3px solid #b9c6ff; outline-offset: 2px; }

        .ns-cf-preview {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 24px;
          overflow-y: auto;
          border-left: 1px solid #eef0f5;
          background: #f7f8fb;
          color: #171c27;
        }
        .ns-cf-preview-label {
          margin: 0;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: #3158f4;
        }
        .ns-cf-preview-card { min-height: 0; color: #171c27; box-shadow: 0 12px 30px rgba(31, 46, 91, .08); }
        .ns-cf-preview-card:hover { transform: none; }
        .ns-cf-preview-card .ns-fc-inner { min-height: 0; }
        .ns-cf-preview-card .ns-fc-title { font-size: 20px; }
        .ns-cf-structure {
          padding: 16px;
          border: 1px solid #e6e9f0;
          border-radius: 16px;
          background: #fff;
        }
        .ns-cf-structure-head {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
          font-size: 12px;
          font-weight: 700;
          color: #5b6578;
        }
        .ns-cf-years { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .ns-cf-year {
          padding: 10px;
          border-radius: 12px;
          border: 1px solid #eef0f5;
          background: #fbfcfe;
        }
        .ns-cf-year-label { display: block; margin-bottom: 7px; font-size: 12px; font-weight: 700; color: #171c27; }
        .ns-cf-year div { display: flex; flex-wrap: wrap; gap: 4px; }
        .ns-cf-sem {
          padding: 3px 8px;
          border-radius: 999px;
          background: #eef2ff;
          color: #3a4ea8;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }
        .ns-cf-structure-empty { margin: 0; font-size: 13px; color: #7a8394; }

        .ns-sw {
          width: 100%;
          max-width: 520px;
          padding: 24px;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 30px 80px rgba(12, 16, 30, .28), 0 0 0 1px rgba(12, 16, 30, .06);
          font-family: var(--font-dm-sans), var(--font-inter), ui-sans-serif, system-ui, sans-serif;
          color: #171c27;
        }
        .ns-sw button { font: inherit; }
        .ns-sw-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .ns-sw-head h2 {
          margin: 0;
          font-family: var(--font-jakarta), var(--font-display), sans-serif;
          font-size: 21px;
          font-weight: 800;
          letter-spacing: -.04em;
        }
        .ns-sw-head p { margin: 4px 0 0; font-size: 14px; color: #667083; }
        .ns-sw-route {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: stretch;
          gap: 10px;
          margin-top: 20px;
        }
        .ns-sw-side {
          display: grid;
          align-content: start;
          gap: 4px;
          min-width: 0;
          padding: 14px;
          border-radius: 16px;
          font-size: 12px;
        }
        .ns-sw-side strong {
          font-family: var(--font-jakarta), var(--font-display), sans-serif;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -.03em;
          overflow-wrap: anywhere;
        }
        .ns-sw-side--from { background: #fff4f5; color: #9f3a4d; }
        .ns-sw-side--from strong { color: #5c1f2b; }
        .ns-sw-side--to { background: #eef2ff; color: #3a4ea8; }
        .ns-sw-side--to strong { color: #1d2b6b; }
        .ns-sw-tag { font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
        .ns-sw-arrow { display: grid; place-items: center; color: #8490a2; }
        .ns-sw-arrow svg { width: 20px; height: 20px; }
        .ns-sw-note { margin: 16px 0 0; font-size: 13px; line-height: 1.55; color: #667083; }
        .ns-sw-error {
          margin: 12px 0 0;
          padding: 10px 12px;
          border-radius: 10px;
          background: #fef2f2;
          color: #b91c1c;
          font-size: 13px;
        }
        .ns-sw-foot { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
        .ns-sw-foot .ns-cf-submit { min-width: 0; }
        .ns-sw-foot .ns-cf-submit svg,
        .ns-sw-foot .ns-cf-submit .animate-spin { width: 16px; height: 16px; }
        @media (max-width: 480px) {
          .ns-sw-route { grid-template-columns: 1fr; }
          .ns-sw-arrow { transform: rotate(90deg); }
          .ns-sw-foot > * { flex: 1; }
        }

        @media (max-width: 820px) {
          .ns-cf { grid-template-columns: 1fr; max-width: 560px; }
          .ns-cf-preview { display: none; }
        }
        @media (max-width: 480px) {
          .ns-cf-overlay { padding: 10px; align-items: flex-end; }
          .ns-cf { max-height: calc(100dvh - 20px); border-radius: 20px; }
          .ns-cf-head { padding: 18px 18px 14px; }
          .ns-cf-body { padding: 18px; }
          .ns-cf-foot { padding: 12px 18px; }
          .ns-cf-submit { flex: 1; min-width: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ns-top-cta,
          .ns-hero-cta,
          .ns-clear-button,
          .ns-filter-select select,
          .ns-fc,
          .ns-fc-open,
          .ns-cf-close,
          .ns-cf-chip span,
          .ns-cf-submit,
          .ns-page-button {
            transition: none;
          }
        }

        @media (max-width: 1120px) {
          .ns-communities-page { width: min(100% - 40px, 1120px); }
          .ns-hero { grid-template-columns: minmax(0, 1fr) 150px; padding-inline: 38px; }
          .ns-hero-art { width: 128px; }
          .ns-discovery { grid-template-columns: 250px minmax(0, 1fr); gap: 20px; }
          .ns-browse-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 800px) {
          .ns-communities-page { width: min(100% - 28px, 720px); padding-bottom: 40px; }
          .ns-topbar { height: 70px; }
          .ns-brand { font-size: 20px; }
          .ns-brand-mark { width: 32px; height: 32px; }
          .ns-top-cta { min-height: 40px; padding-inline: 17px; font-size: 14px; }
          .ns-hero { min-height: auto; grid-template-columns: 1fr; padding: 31px 28px; }
          .ns-hero h1 { font-size: clamp(2.25rem, 9vw, 3rem); }
          .ns-hero p { margin-bottom: 20px; }
          .ns-hero-art { display: none; }
          .ns-discovery { grid-template-columns: 1fr; }
          .ns-filters { padding: 18px; }
          .ns-browse-grid { gap: 14px; }
          .ns-fc-inner { padding: 20px; }
          .ns-fc-title { font-size: 20px; }
          .ns-pagination-wrap { align-items: flex-start; flex-direction: column; }
        }

        @media (max-width: 560px) {
          .ns-communities-page { width: min(100% - 20px, 520px); }
          .ns-top-cta span { display: none; }
          .ns-hero { padding: 28px 22px; }
          .ns-hero h1 { font-size: 2.25rem; }
          .ns-hero p { font-size: 1rem; }
          .ns-browse-intro { flex-direction: column; align-items: stretch; gap: 12px; }
          .ns-browse-search { flex-basis: auto; }
          .ns-browse-grid { grid-template-columns: 1fr; }
          .ns-fc-bottom { flex-wrap: wrap; }
          .ns-pagination { width: 100%; justify-content: space-between; }
          .ns-page-button span { display: none; }
        }
      `}</style>

      {/* Topbar matching preview (2).html */}
      <header className="ns-topbar">
        <Link className="ns-brand" href="/" aria-label="NanoSyllabus home">
          <Image
            className="ns-brand-mark"
            src="/nanologo.png"
            alt=""
            width={42}
            height={42}
          />
          <span>NanoSyllabus</span>
        </Link>
        <Link
          className="ns-top-cta"
          href={signedIn ? "/app/today" : "/login?next=%2Fcommunities"}
        >
          <span>{signedIn ? "Go to app" : "Sign in"}</span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </Link>
      </header>

      {/* Hero Section */}
      <section className="ns-hero" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title">Study better together.</h1>
          <p>Join students following your syllabus.</p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20 }}>
            {signedIn ? (
              <button
                type="button"
                className="ns-hero-cta ns-hero-cta--blue"
                onClick={openCreate}
              >
                Add New Faculty
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path d="M7 17L17 7M17 7H8M17 7v9"/>
                </svg>
              </button>
            ) : (
              <Link
                href="/login?next=%2Fcommunities%3Fcreate%3D1"
                className="ns-hero-cta ns-hero-cta--blue"
              >
                Add New Faculty
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path d="M7 17L17 7M17 7H8M17 7v9"/>
                </svg>
              </Link>
            )}
          </div>
        </div>
        <div className="ns-hero-art" aria-hidden="true">
          <svg
            viewBox="0 0 120 120"
            fill="none"
            stroke="#101114"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="60" cy="36" r="13"/>
            <circle cx="29" cy="45" r="10"/>
            <circle cx="91" cy="45" r="10"/>
            <path d="M37 89V76c0-14 10-24 23-24s23 10 23 24v13H37ZM11 83V70c0-10 8-18 18-18 5 0 9 2 12 5M109 83V70c0-10-8-18-18-18-5 0-9 2-12 5"/>
          </svg>
        </div>
      </section>

      {/* Create Form — centred modal */}
      <LazyMotion features={domAnimation} strict>
        <AnimatePresence>
          {showCreate ? (
            <m.div
              key="create-overlay"
              className="ns-cf-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(event) => {
                if (event.target === event.currentTarget && !submitting) setShowCreate(false);
              }}
            >
              <m.section
                id="ns-create-section"
                className="ns-cf"
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-community-title"
                initial={{ opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.7 }}
              >
                <form className="ns-cf-form" onSubmit={submit} noValidate aria-busy={submitting}>
                  <header className="ns-cf-head">
                    <span className="ns-cf-mark" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <path d="m3 9 9-5 9 5-9 5-9-5Z" />
                        <path d="M7 11.5V16l5 3 5-3v-4.5" />
                      </svg>
                    </span>
                    <div className="ns-cf-head-text">
                      <h2 id="create-community-title">Create a faculty</h2>
                      <p>Set the structure once. Semesters are generated for you.</p>
                    </div>
                    <button
                      type="button"
                      className="ns-cf-close"
                      onClick={() => setShowCreate(false)}
                      disabled={submitting}
                      aria-label="Close"
                    >
                      <X aria-hidden="true" />
                    </button>
                  </header>

                  <m.div
                    className="ns-cf-body"
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.06 } } }}
                  >
                    {formError ? (
                      <div className="ns-cf-alert" role="alert">
                        <strong>Could not create the faculty</strong>
                        <span>{formError}</span>
                      </div>
                    ) : null}

                    <m.div variants={fieldReveal} className="ns-cf-field">
                      <label htmlFor="community-university" className="ns-cf-label">
                        University
                      </label>
                      <div className="ns-cf-select">
                        <select
                          id="community-university"
                          value={draft.university}
                          onChange={(event) => updateDraft("university", event.target.value)}
                          data-empty={!draft.university || undefined}
                          aria-invalid={Boolean(fieldErrors.university) || undefined}
                          aria-describedby={fieldErrors.university ? "community-university-error" : undefined}
                        >
                          <option value="" disabled>
                            Select university
                          </option>
                          {communityUniversities.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                      <FieldError id="community-university-error" message={fieldErrors.university} />
                    </m.div>

                    <m.div variants={fieldReveal} className="ns-cf-field">
                      <label htmlFor="community-level" className="ns-cf-label">
                        Level
                      </label>
                      <div className="ns-cf-select">
                        <select
                          id="community-level"
                          value={draft.level}
                          onChange={(event) => updateDraft("level", event.target.value)}
                          data-empty={!draft.level || undefined}
                          aria-invalid={Boolean(fieldErrors.level) || undefined}
                          aria-describedby={fieldErrors.level ? "community-level-error" : undefined}
                        >
                          <option value="" disabled>
                            Select level
                          </option>
                          {communityLevels.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                      <FieldError id="community-level-error" message={fieldErrors.level} />
                    </m.div>

                    <m.div variants={fieldReveal} className="ns-cf-field">
                      <label htmlFor="community-faculty" className="ns-cf-label">
                        Faculty or programme
                      </label>
                      <input
                        ref={firstFieldRef}
                        id="community-faculty"
                        className="ns-cf-input"
                        value={draft.faculty}
                        onChange={(event) => updateDraft("faculty", event.target.value)}
                        placeholder="Bachelor in Electronics Engineering"
                        autoComplete="off"
                        aria-invalid={Boolean(fieldErrors.faculty) || undefined}
                        aria-describedby={fieldErrors.faculty ? "community-faculty-error" : undefined}
                      />
                      <FieldError id="community-faculty-error" message={fieldErrors.faculty} />
                    </m.div>

                    <div className="ns-cf-pair">
                    {(
                      [
                        ["totalYears", "Total years", "community-years-error", 1, 10],
                        ["totalSemesters", "Total semesters", "community-semesters-error", 1, 40],
                      ] as const
                    ).map(([field, label, errorId, min, max]) => (
                      <m.div key={field} variants={fieldReveal} className="ns-cf-field">
                        <label htmlFor={`community-${field}`} className="ns-cf-label">
                          {label}
                        </label>
                        <div className="ns-cf-stepper" data-invalid={Boolean(fieldErrors[field]) || undefined}>
                          <button
                            type="button"
                            onClick={() => stepDraft(field, -1, min, max)}
                            aria-label={`Fewer ${label.toLowerCase().replace("total ", "")}`}
                          >
                            −
                          </button>
                          <input
                            id={`community-${field}`}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={draft[field]}
                            onChange={(event) => updateDraft(field, event.target.value)}
                            aria-invalid={Boolean(fieldErrors[field]) || undefined}
                            aria-describedby={fieldErrors[field] ? errorId : undefined}
                          />
                          <button
                            type="button"
                            onClick={() => stepDraft(field, 1, min, max)}
                            aria-label={`More ${label.toLowerCase().replace("total ", "")}`}
                          >
                            +
                          </button>
                        </div>
                        <FieldError id={errorId} message={fieldErrors[field]} />
                      </m.div>
                    ))}
                    </div>

                    <m.div variants={fieldReveal} className="ns-cf-field">
                      <label htmlFor="community-phoneNumber" className="ns-cf-label">
                        Phone number
                      </label>
                      {(() => {
                        const phone = fieldErrors.phoneNumber ? null : describePhoneNumber(draft.phoneNumber);
                        return (
                          <>
                            <div className="ns-cf-phone" data-invalid={Boolean(fieldErrors.phoneNumber) || undefined}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
                              </svg>
                              <input
                                id="community-phoneNumber"
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                value={draft.phoneNumber}
                                onChange={(event) => updateDraft("phoneNumber", event.target.value)}
                                onBlur={() =>
                                  setFieldErrors((current) => ({
                                    ...current,
                                    phoneNumber: draft.phoneNumber.trim()
                                      ? getPhoneNumberError(draft.phoneNumber)
                                      : "",
                                  }))
                                }
                                placeholder="98XXXXXXXX"
                                aria-invalid={Boolean(fieldErrors.phoneNumber) || undefined}
                                aria-describedby={
                                  fieldErrors.phoneNumber ? "community-phone-error" : "community-phone-status"
                                }
                              />
                              {phone ? (
                                <span className={`ns-cf-phone-badge${phone.nepal ? " is-nepal" : ""}`}>
                                  {phone.nepal ? "Nepal" : "International"}
                                </span>
                              ) : null}
                            </div>
                            {fieldErrors.phoneNumber ? (
                              <FieldError id="community-phone-error" message={fieldErrors.phoneNumber} />
                            ) : (
                              <p id="community-phone-status" className="ns-cf-hint" aria-live="polite">
                                {phone ? phone.text : "Nepali mobile numbers work with or without +977."}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </m.div>

                    <m.fieldset
                      variants={fieldReveal}
                      id="community-challengeQuestionFormat"
                      tabIndex={-1}
                      className="ns-cf-field"
                      aria-describedby={
                        fieldErrors.challengeQuestionFormat ? "community-format-error" : undefined
                      }
                    >
                      <legend className="ns-cf-label">Challenge questions</legend>
                      <div className="ns-cf-chips ns-cf-chips--wide" role="radiogroup">
                        {createFormatOptions.map(({ format, label }) => (
                          <label key={format} className="ns-cf-chip">
                            <input
                              type="radio"
                              name="challengeQuestionFormat"
                              value={format}
                              checked={draft.challengeQuestionFormat === format}
                              onChange={() => updateDraft("challengeQuestionFormat", format)}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                      <FieldError id="community-format-error" message={fieldErrors.challengeQuestionFormat} />
                    </m.fieldset>
                  </m.div>

                  <footer className="ns-cf-foot">
                    <button
                      type="button"
                      className="ns-cf-cancel"
                      onClick={() => setShowCreate(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="ns-cf-submit" disabled={submitting} aria-busy={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden="true" /> Creating…
                        </>
                      ) : (
                        <>
                          Create faculty
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M4 12h15m-6-6 6 6-6 6" />
                          </svg>
                        </>
                      )}
                    </button>
                  </footer>
                </form>

                <aside className="ns-cf-preview" aria-live="polite" aria-label="Preview">
                  <p className="ns-cf-preview-label">Live preview</p>
                  <div className="ns-fc ns-fc--blue ns-cf-preview-card" aria-hidden="true">
                    <div className="ns-fc-inner">
                      <div className="ns-fc-top">
                        <div className="ns-fc-monogram">
                          {draft.faculty.trim() ? communityMonogram(draft.faculty) : "NS"}
                        </div>
                        {draft.level ? <span className="ns-fc-tag">{draft.level}</span> : null}
                      </div>
                      <h3 className="ns-fc-title">{draft.faculty.trim() || "Your faculty"}</h3>
                      <p className="ns-fc-subtitle">{draft.university || "Choose a university"}</p>
                      <div className="ns-fc-meta">
                        <span>
                          {plural(totalYears, "year")} · {plural(totalSemesters, "semester")}
                        </span>
                        {draft.challengeQuestionFormat ? (
                          <span>
                            <strong>{draft.challengeQuestionFormat === "mcq" ? "MCQ" : "QnA"}</strong> challenges
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="ns-cf-structure">
                    <div className="ns-cf-structure-head">
                      <span>Semester structure</span>
                      {previewTerms.length ? <span>{plural(previewTerms.length, "slot")}</span> : null}
                    </div>
                    {previewTerms.length ? (
                      <div className="ns-cf-years">
                        {Array.from({ length: totalYears }, (_, index) => index + 1).map((year) => (
                          <div key={year} className="ns-cf-year">
                            <span className="ns-cf-year-label">Year {year}</span>
                            <div>
                              {previewTerms
                                .filter((term) => term.yearNumber === year)
                                .map((term) => (
                                  <span key={term.semesterNumber} className="ns-cf-sem">
                                    Sem {term.semesterNumber}
                                  </span>
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="ns-cf-structure-empty">
                        Use 1–4 semesters per year to preview the slots.
                      </p>
                    )}
                  </div>
                </aside>
              </m.section>
            </m.div>
          ) : null}
        </AnimatePresence>
      </LazyMotion>

      {/* Discovery Section: Filters + Community Grid */}
      <section className="ns-discovery" id="communities" aria-label="Browse faculties">
        {/* Sleek Sidebar Filters */}
        <aside className="ns-filters" aria-label="Community filters">
          <div className="ns-filters-header">
            <h2>Filters</h2>
            <button className="ns-clear-button" type="button" onClick={clearAllFilters}>
              Clear
            </button>
          </div>

          <div>
            {/* University Group */}
            <div className="ns-filter-group">
              <label className="ns-filter-label" htmlFor="ns-filter-university">
                University
              </label>
              <div className="ns-filter-select">
                <select
                  id="ns-filter-university"
                  value={selectedUniversity}
                  onChange={(e) => {
                    setSelectedUniversity(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">All universities</option>
                  {availableUniversities.map((uni) => (
                    <option key={uni} value={uni}>
                      {uni}
                    </option>
                  ))}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>

            {/* Level Group */}
            <div className="ns-filter-group">
              <label className="ns-filter-label" htmlFor="ns-filter-level">
                Level
              </label>
              <div className="ns-filter-select">
                <select
                  id="ns-filter-level"
                  value={selectedLevel}
                  onChange={(e) => {
                    setSelectedLevel(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">All levels</option>
                  {availableLevels.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>
        </aside>

        <div className="ns-results ns-browse">
          <div className="ns-browse-intro">
            <div className="ns-browse-heading">
              <h2>Browse faculties</h2>
              <span className="ns-browse-count" aria-live="polite">
                {totalItems} {totalItems === 1 ? "community" : "communities"}
              </span>
            </div>

            <label className="ns-browse-search">
              <span className="sr-only">Search communities</span>
              <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="7.4" />
                <path d="m16.5 16.5 5 5" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search programme or university"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="ns-browse-grid">
            {paginatedCommunities.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                signedIn={signedIn}
                currentCommunity={currentCommunity}
              />
            ))}
          </div>
          {!totalItems ? (
            <div className="ns-browse-empty">
              <h3>No communities found</h3>
              <p>Try another search or reset your filters.</p>
              <button type="button" onClick={clearAllFilters}>
                Clear filters
              </button>
            </div>
          ) : null}

          {/* Pagination */}
          {totalItems > 0 ? (
            <div className="ns-pagination-wrap">
              <span className="ns-page-summary" aria-live="polite">
                Showing {start + 1}–{end} of {totalItems}
              </span>

              <nav className="ns-pagination" aria-label="Community pages">
                <button
                  className="ns-page-button"
                  type="button"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage <= 1}
                  aria-label="Previous page"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  <span>Previous</span>
                </button>

                <div className="ns-page-numbers">
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      className="ns-page-button"
                      onClick={() => goToPage(page)}
                      aria-label={`Go to page ${page}`}
                      aria-current={page === safePage ? "page" : undefined}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  className="ns-page-button"
                  type="button"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                  aria-label="Next page"
                >
                  <span>Next</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </nav>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
