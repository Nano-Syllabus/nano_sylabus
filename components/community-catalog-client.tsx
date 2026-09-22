"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import {
  communityInputSchema,
  generateCommunityTerms,
  type CommunitySummary,
} from "@/lib/communities";
import { titleCase } from "@/lib/utils";
import { CommunityLeaveControl } from "@/components/community-leave-control";

type Draft = {
  name: string;
  university: string;
  faculty: string;
  description: string;
  totalYears: string;
  totalSemesters: string;
};

const emptyDraft: Draft = {
  name: "",
  university: "",
  faculty: "",
  description: "",
  totalYears: "4",
  totalSemesters: "8",
};

function detectLevel(community: CommunitySummary): string {
  const text = `${community.name} ${community.faculty}`.toLowerCase();
  if (
    text.includes("+2") ||
    text.includes("plus two") ||
    text.includes("11") ||
    text.includes("12") ||
    text.includes("neb")
  ) {
    return "+2";
  }
  if (
    text.includes("master") ||
    text.includes("msc") ||
    text.includes("mba") ||
    text.includes("m.")
  ) {
    return "Master";
  }
  return "Bachelor";
}

function getUniversityEmblem(university: string, name: string): {
  abbr: string;
  bg: string;
  color: string;
} {
  const u = (university || "").toLowerCase();
  const n = (name || "").toLowerCase();

  if (u.includes("tribhuvan") || u.includes("tribhuwan") || u === "tu") {
    if (n.includes("csit")) return { abbr: "CSIT", bg: "#eef8ff", color: "#17619a" };
    if (n.includes("bca")) return { abbr: "BCA", bg: "#fff4e9", color: "#a4520a" };
    if (n.includes("bbs")) return { abbr: "BBS", bg: "#effaf1", color: "#27713a" };
    if (n.includes("msc")) return { abbr: "MSc", bg: "#f0f2ff", color: "#494f9d" };
    return { abbr: "TU", bg: "#edf3ff", color: "#174fc4" };
  }
  if (u.includes("kathmandu") || u === "ku") {
    return { abbr: "KU", bg: "#fff0f0", color: "#bf2020" };
  }
  if (u.includes("pokhara") || u === "pu") {
    if (n.includes("civil") || n.includes("ce")) {
      return { abbr: "CE", bg: "#f4f1ff", color: "#6541a5" };
    }
    return { abbr: "PU", bg: "#f0f6ff", color: "#284d9f" };
  }
  if (u.includes("purbanchal")) {
    return { abbr: "PU", bg: "#fff5e9", color: "#b65f00" };
  }
  if (u.includes("national examination board") || u.includes("neb")) {
    return { abbr: "NEB", bg: "#f1fff3", color: "#167d2b" };
  }

  const words = (university || "").trim().split(/\s+/).filter(Boolean);
  let abbr =
    words.length >= 2
      ? words
          .map((w) => w[0].toUpperCase())
          .slice(0, 3)
          .join("")
      : (name || "NS").slice(0, 3).toUpperCase();
  if (!abbr) abbr = "NS";

  const palettes = [
    { bg: "#edf3ff", color: "#174fc4" },
    { bg: "#fff0f0", color: "#bf2020" },
    { bg: "#f0f6ff", color: "#284d9f" },
    { bg: "#fff5e9", color: "#b65f00" },
    { bg: "#f1fff3", color: "#167d2b" },
    { bg: "#f4f1ff", color: "#6541a5" },
    { bg: "#eef8ff", color: "#17619a" },
    { bg: "#effaf1", color: "#27713a" },
  ];

  let hash = 0;
  for (let i = 0; i < (university || name || "").length; i++) {
    hash = (university || name || "").charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = palettes[Math.abs(hash) % palettes.length];
  return { abbr, bg: palette.bg, color: palette.color };
}

function CommunityCard({
  community,
  signedIn,
}: {
  community: CommunitySummary;
  signedIn: boolean;
}) {
  const router = useRouter();
  const joined = community.membership?.status === "active";
  const creator = joined && community.membership?.role === "creator";
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const emblem = useMemo(
    () => getUniversityEmblem(community.university, community.name),
    [community.university, community.name],
  );

  async function joinCommunity() {
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
      };
      if (!response.ok) {
        setJoinError(payload.error || "Could not join this community. Please try again.");
        return;
      }
      router.push(`/flow?community=${encodeURIComponent(community.slug)}`);
      router.refresh();
    } catch {
      setJoinError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <article
      className="ns-community-card"
      data-name={`${community.name} ${community.faculty}`}
      data-university={community.university}
      data-level={detectLevel(community)}
    >
      {/* Top right Action Button / Link */}
      {creator ? (
        <Link
          className="ns-card-arrow"
          href={`/teachers?view=communities&community=${encodeURIComponent(community.slug)}`}
          aria-label={`Open ${community.name} admin workspace`}
          title="Open Admin Workspace"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      ) : joined ? (
        <Link
          className="ns-card-arrow"
          href={`/app/communities/${encodeURIComponent(community.slug)}`}
          aria-label={`Open ${community.name} community`}
          title="Open Community"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      ) : signedIn ? (
        <button
          type="button"
          className="ns-card-arrow"
          onClick={joinCommunity}
          disabled={joining}
          aria-busy={joining}
          aria-label={`Join ${community.name}`}
          title="Join Community"
        >
          {joining ? (
            <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
      ) : (
        <Link
          className="ns-card-arrow"
          href={`/flow?community=${encodeURIComponent(community.slug)}`}
          aria-label={`Join ${community.name}`}
          title="Join Community"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      )}

      {/* University Emblem */}
      <div
        className="ns-community-emblem"
        style={{
          backgroundColor: emblem.bg,
          color: emblem.color,
        }}
      >
        {emblem.abbr}
      </div>

      {/* Community Content */}
      <div className="ns-community-content">
        <h3 className="ns-community-name">
          {titleCase(community.name)}
        </h3>
        <p className="ns-community-owner">
          {community.university}
        </p>

        {/* 2x2 Meta Grid */}
        <div className="ns-meta-grid">
          {/* Duration */}
          <div className="ns-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 11h18" />
            </svg>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {community.totalYears} years
              {community.totalSemesters ? ` · ${community.totalSemesters} semesters` : ""}
            </span>
          </div>

          {/* Subjects */}
          <div className="ns-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z" />
              <path d="M8 7h8" />
            </svg>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {community.subjectCount} {community.subjectCount === 1 ? "subject" : "subjects"}
            </span>
          </div>

          {/* Members */}
          <div className="ns-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {community.memberCount} {community.memberCount === 1 ? "member" : "members"}
              {creator ? (
                <span className="ns-creator" style={{ marginLeft: 6, color: "#1768ff", fontWeight: 600 }}>
                  Creator
                </span>
              ) : joined ? (
                <span className="ns-joined" style={{ marginLeft: 6 }}>
                  Joined
                </span>
              ) : null}
            </span>
          </div>

          {/* Faculty / Programme */}
          <div className="ns-meta-item" title={community.faculty}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m3 10 9-5 9 5-9 5-9-5Z" />
              <path d="M7 12.5V17l5 3 5-3v-4.5" />
            </svg>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {community.faculty}
            </span>
          </div>
        </div>

        {/* Join error or leave control */}
        {joined && !creator ? (
          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
            <CommunityLeaveControl community={community} />
          </div>
        ) : null}

        {joinError ? (
          <div
            role="alert"
            style={{
              marginTop: 10,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #fecaca",
              backgroundColor: "#fef2f2",
              fontSize: 12,
              color: "#b91c1c",
            }}
          >
            <p>{joinError}</p>
            <button
              type="button"
              onClick={joinCommunity}
              disabled={joining}
              style={{
                marginTop: 4,
                fontWeight: 600,
                textDecoration: "underline",
                background: "none",
                border: 0,
                cursor: "pointer",
                color: "#991b1b",
              }}
            >
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
}: {
  initialCommunities: CommunitySummary[];
  signedIn: boolean;
  initialShowCreate?: boolean;
}) {
  const router = useRouter();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedUniversities, setSelectedUniversities] = useState<string[]>([]);
  const [selectedInstitutes, setSelectedInstitutes] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  const [showCreate, setShowCreate] = useState(initialShowCreate);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Dynamic filter options derived from initialCommunities + standard fallbacks
  const availableUniversities = useMemo(() => {
    const set = new Set<string>();
    initialCommunities.forEach((c) => {
      if (c.university) set.add(c.university.trim());
    });
    ["Tribhuvan University", "Kathmandu University", "Pokhara University", "Purbanchal University"].forEach(
      (u) => set.add(u),
    );
    return Array.from(set);
  }, [initialCommunities]);

  const availableInstitutes = useMemo(() => {
    const set = new Set<string>();
    initialCommunities.forEach((c) => {
      if (c.faculty) set.add(c.faculty.trim());
    });
    [
      "Institute of Engineering",
      "Institute of Science and Technology",
      "Faculty of Management",
    ].forEach((f) => set.add(f));
    return Array.from(set);
  }, [initialCommunities]);

  const availableLevels = ["+2", "Bachelor", "Master"];

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
          detectLevel(community),
        ]
          .join(" ")
          .toLowerCase();

        const matchesSearch = !needle || haystack.includes(needle);

        const matchesUniversity =
          !selectedUniversities.length ||
          selectedUniversities.some((u) =>
            community.university.toLowerCase().includes(u.toLowerCase()),
          );

        const matchesInstitute =
          !selectedInstitutes.length ||
          selectedInstitutes.some((inst) =>
            community.faculty.toLowerCase().includes(inst.toLowerCase()),
          );

        const level = detectLevel(community);
        const matchesLevel =
          !selectedLevels.length ||
          selectedLevels.some((lvl) => level.toLowerCase() === lvl.toLowerCase());

        return matchesSearch && matchesUniversity && matchesInstitute && matchesLevel;
      })
      .sort(
        (left, right) =>
          right.memberCount - left.memberCount || left.name.localeCompare(right.name),
      );
  }, [initialCommunities, query, selectedUniversities, selectedInstitutes, selectedLevels]);

  // Pagination calculation
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, totalItems);
  const paginatedCommunities = filtered.slice(start, end);

  function toggleUniversity(uni: string) {
    setSelectedUniversities((prev) =>
      prev.includes(uni) ? prev.filter((item) => item !== uni) : [...prev, uni],
    );
    setCurrentPage(1);
  }

  function toggleInstitute(inst: string) {
    setSelectedInstitutes((prev) =>
      prev.includes(inst) ? prev.filter((item) => item !== inst) : [...prev, inst],
    );
    setCurrentPage(1);
  }

  function toggleLevel(lvl: string) {
    setSelectedLevels((prev) =>
      prev.includes(lvl) ? prev.filter((item) => item !== lvl) : [...prev, lvl],
    );
    setCurrentPage(1);
  }

  function clearAllFilters() {
    setQuery("");
    setSelectedUniversities([]);
    setSelectedInstitutes([]);
    setSelectedLevels([]);
    setCurrentPage(1);
  }

  function goToPage(page: number) {
    setCurrentPage(page);
    document
      .querySelector(".ns-results-header")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const totalYears = Number.parseInt(draft.totalYears, 10) || 0;
  const totalSemesters = Number.parseInt(draft.totalSemesters, 10) || 0;
  const previewTerms =
    totalYears >= 1 && totalSemesters >= totalYears && totalSemesters <= totalYears * 4
      ? generateCommunityTerms(totalYears, totalSemesters)
      : [];

  function updateDraft(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }

  function openCreate() {
    setShowCreate(true);
    window.setTimeout(() => {
      document.getElementById("ns-create-section")?.scrollIntoView({ behavior: "smooth" });
      firstFieldRef.current?.focus();
    }, 50);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFieldErrors({});
    const parsed = communityInputSchema.safeParse({
      ...draft,
      totalYears,
      totalSemesters,
      visibility: "public",
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] || "form");
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      const first = parsed.error.issues[0]?.path[0];
      if (first) document.getElementById(`community-${String(first)}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        community?: CommunitySummary;
        error?: string;
        field?: string;
      };
      if (!response.ok || !payload.community) {
        if (payload.field)
          setFieldErrors({ [payload.field]: payload.error || "Check this value." });
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

        .ns-top-cta:focus-visible,
        .ns-hero-cta:focus-visible,
        .ns-hero-how:focus-visible,
        .ns-clear-button:focus-visible,
        .ns-card-arrow:focus-visible,
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

        .ns-hero-how {
          font-size: 14px;
          font-weight: 600;
          color: #101114;
          text-decoration: none;
          border-bottom: 1.5px solid #101114;
          padding-bottom: 1px;
          transition: color .18s ease, border-color .18s ease;
        }
        .ns-hero-how:hover {
          color: #3049ed;
          border-color: #3049ed;
        }

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
          margin: 0 0 12px;
          padding: 0;
          font-size: 14px;
          font-weight: 750;
          letter-spacing: -0.01em;
          color: #101114;
        }

        .ns-location-select {
          width: 100%;
          height: 42px;
          padding: 0 34px 0 38px;
          border: 1px solid #d7ddd0;
          border-radius: 10px;
          color: #101114;
          background-color: white;
          background-image:
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23101114' stroke-width='2'%3E%3Cpath d='M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z'/%3E%3Ccircle cx='12' cy='10' r='2.5'/%3E%3C/svg%3E"),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23101114' stroke-width='2'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: 11px center, right 12px center;
          background-size: 19px, 17px;
          appearance: none;
          font-size: 14px;
          outline: none;
          cursor: pointer;
        }

        .ns-location-select:focus {
          border-color: #3049ed;
          box-shadow: 0 0 0 3px rgba(48, 73, 237, 0.14);
        }

        .ns-check-list {
          display: grid;
          gap: 4px;
        }

        .ns-check-row {
          position: relative;
          min-height: 40px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 5px 8px;
          margin: 0 -8px;
          border-radius: 8px;
          color: #343940;
          font-size: 0.875rem;
          line-height: 1.35;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .ns-filter-checkbox {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }

        .ns-filter-checkbox:focus-visible + .ns-custom-checkbox {
          outline: 2px solid #3049ed;
          outline-offset: 2px;
        }

        .ns-check-row:hover {
          background: #ebf1ff;
          color: #101114;
        }

        .ns-custom-checkbox {
          width: 18px;
          height: 18px;
          border-radius: 5px;
          border: 1.5px solid #c7d3fb;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
        }

        .ns-custom-checkbox.is-checked {
          border-color: #3049ed;
          background: #3049ed;
          color: #ffffff;
        }

        .ns-check-row:hover .ns-custom-checkbox:not(.is-checked) {
          border-color: #3049ed;
        }

        .ns-results { min-width: 0; }

        .ns-results-header {
          min-height: 58px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .ns-results-heading {
          display: flex;
          align-items: baseline;
          gap: 14px;
          min-width: max-content;
        }

        .ns-results-heading h2 {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(1.625rem, 2vw, 2rem);
          line-height: 1.15;
          letter-spacing: -0.035em;
          font-weight: 600;
          color: #101114;
        }

        .ns-result-count {
          display: inline-flex;
          min-height: 28px;
          align-items: center;
          border-radius: 999px;
          padding: 0 10px;
          color: #0a2ec3;
          background: #ebf1ff;
          font-size: 0.8125rem;
          font-weight: 600;
        }

        .ns-search {
          position: relative;
          width: min(450px, 46%);
          flex: 0 1 450px;
        }

        .ns-search svg {
          position: absolute;
          left: 17px;
          top: 50%;
          width: 21px;
          height: 21px;
          transform: translateY(-50%);
          pointer-events: none;
          color: #777e88;
        }

        .ns-search input {
          width: 100%;
          height: 50px;
          padding: 0 18px 0 50px;
          border: 1px solid #d6dbe3;
          border-radius: 15px;
          outline: 0;
          color: #101114;
          background: white;
          font-size: 15px;
          transition: border-color .18s ease, box-shadow .18s ease;
        }

        .ns-search input::placeholder { color: #777e88; font-weight: 400; }
        .ns-search input:focus { border-color: #7f8792; box-shadow: 0 0 0 4px rgba(16,17,20,.06); }

        .ns-community-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .ns-community-card {
          position: relative;
          min-height: 188px;
          padding: 18px 17px 17px;
          display: grid;
          grid-template-columns: 84px minmax(0, 1fr);
          gap: 16px;
          overflow: hidden;
          border: 1px solid #e5e8df;
          border-radius: 15px;
          background: white;
          transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
        }

        .ns-community-card:hover {
          border-color: #9eb0fb;
          box-shadow: 0 10px 24px rgba(48, 73, 237, .09);
          transform: translateY(-2px);
        }

        .ns-card-arrow {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 2;
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border: 1px solid #c9d5ff;
          border-radius: 50%;
          color: #0a2ec3;
          background: #ebf1ff;
          text-decoration: none;
          transition: background .18s ease, transform .18s ease;
          cursor: pointer;
        }

        .ns-card-arrow:hover { color: #ffffff; background: #3049ed; transform: translateX(2px); }
        .ns-card-arrow:disabled { cursor: wait; opacity: 0.7; }
        .ns-card-arrow svg { width: 18px; height: 18px; }

        .ns-community-emblem {
          width: 72px;
          height: 72px;
          display: grid;
          place-items: center;
          border: 1px solid #d6dbe3;
          border-radius: 50%;
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -0.035em;
        }

        .ns-community-content { min-width: 0; }

        .ns-community-name {
          margin: 2px 48px 2px 0;
          font-family: var(--font-display);
          font-size: 1.125rem;
          line-height: 1.25;
          letter-spacing: -0.025em;
          font-weight: 600;
          color: #101114;
        }

        .ns-community-owner {
          margin: 0;
          color: #4f5661;
          font-size: 14px;
          line-height: 1.4;
          font-weight: 400;
        }

        .ns-meta-grid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px;
        }

        .ns-meta-item {
          min-height: 42px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          gap: 9px;
          border-radius: 10px;
          color: #3f454e;
          background: #f5f7f1;
          font-size: 0.8125rem;
          line-height: 1.35;
          font-weight: 400;
        }

        .ns-meta-item svg { width: 18px; height: 18px; flex: 0 0 auto; color: #3049ed; }

        .ns-joined {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #159947;
          white-space: nowrap;
          font-weight: 600;
        }

        .ns-joined::before {
          content: "";
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #159947;
        }

        .ns-empty-state {
          grid-column: 1 / -1;
          padding: 52px 24px;
          border: 1px dashed #d6dbe3;
          border-radius: 15px;
          text-align: center;
          color: #606774;
        }

        .ns-empty-state strong {
          display: block;
          margin-bottom: 6px;
          color: #101114;
          font-family: var(--font-display);
          font-size: 1.125rem;
          font-weight: 600;
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

        @media (prefers-reduced-motion: reduce) {
          .ns-top-cta,
          .ns-hero-cta,
          .ns-hero-how,
          .ns-clear-button,
          .ns-check-row,
          .ns-custom-checkbox,
          .ns-community-card,
          .ns-card-arrow,
          .ns-page-button {
            transition: none;
          }
        }

        @media (max-width: 1120px) {
          .ns-communities-page { width: min(100% - 40px, 1120px); }
          .ns-hero { grid-template-columns: minmax(0, 1fr) 150px; padding-inline: 38px; }
          .ns-hero-art { width: 128px; }
          .ns-discovery { grid-template-columns: 250px minmax(0, 1fr); gap: 20px; }
          .ns-community-grid { grid-template-columns: 1fr; }
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
          .ns-results-header { align-items: flex-start; flex-direction: column; }
          .ns-results-heading { min-width: 0; }
          .ns-search { width: 100%; flex-basis: auto; }
          .ns-pagination-wrap { align-items: flex-start; flex-direction: column; }
        }

        @media (max-width: 560px) {
          .ns-communities-page { width: min(100% - 20px, 520px); }
          .ns-top-cta span { display: none; }
          .ns-hero { padding: 28px 22px; }
          .ns-hero h1 { font-size: 2.25rem; }
          .ns-hero p { font-size: 1rem; }
          .ns-results-heading { display: block; }
          .ns-result-count { display: block; margin-top: 8px; }
          .ns-community-card { grid-template-columns: 60px minmax(0, 1fr); gap: 12px; padding: 15px; }
          .ns-community-emblem { width: 54px; height: 54px; font-size: 14px; }
          .ns-community-name { font-size: 1rem; }
          .ns-card-arrow { top: 13px; right: 13px; width: 40px; height: 40px; }
          .ns-meta-grid { grid-column: 1 / -1; margin-left: -72px; }
          .ns-meta-item { min-height: 40px; font-size: 0.75rem; }
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
            <a
              href="#steps"
              className="ns-hero-how"
            >
              How does it work?
            </a>
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

      {/* Expandable Create Form */}
      {showCreate ? (
        <section
          id="ns-create-section"
          style={{
            marginTop: 28,
            padding: 24,
            borderRadius: 15,
            border: "1px solid #d6dbe3",
            backgroundColor: "#ffffff",
          }}
          aria-labelledby="create-community-title"
        >
          <div style={{ display: "grid", gap: 32, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <form onSubmit={submit} noValidate aria-busy={submitting}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2
                  id="create-community-title"
                  style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 750,
                    letterSpacing: "-0.035em",
                  }}
                >
                  Create a community
                </h2>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  style={{
                    background: "none",
                    border: 0,
                    cursor: "pointer",
                    padding: 4,
                    color: "#606774",
                  }}
                >
                  <X style={{ width: 20, height: 20 }} />
                </button>
              </div>
              <p style={{ margin: "8px 0 20px", fontSize: 14, color: "#606774" }}>
                Enter the academic structure once. Semester slots are generated automatically.
              </p>

              {formError ? (
                <div
                  role="alert"
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid #fecaca",
                    backgroundColor: "#fef2f2",
                    fontSize: 13,
                    color: "#b91c1c",
                  }}
                >
                  <p style={{ fontWeight: 600 }}>Could not create community</p>
                  <p style={{ marginTop: 2 }}>{formError}</p>
                </div>
              ) : null}

              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <label htmlFor="community-name" style={{ fontSize: 14, fontWeight: 600 }}>
                    Community name <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="community-name"
                    value={draft.name}
                    onChange={(event) => updateDraft("name", event.target.value)}
                    placeholder="SEC BEI"
                    autoComplete="organization"
                    spellCheck={false}
                    aria-invalid={Boolean(fieldErrors.name) || undefined}
                    aria-describedby={fieldErrors.name ? "community-name-error" : undefined}
                    style={{
                      width: "100%",
                      height: 44,
                      marginTop: 6,
                      padding: "0 14px",
                      borderRadius: 10,
                      border: "1px solid #d6dbe3",
                      fontSize: 14,
                      outline: 0,
                    }}
                  />
                  <FieldError id="community-name-error" message={fieldErrors.name} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label htmlFor="community-university" style={{ fontSize: 14, fontWeight: 600 }}>
                      University <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="community-university"
                      value={draft.university}
                      onChange={(event) => updateDraft("university", event.target.value)}
                      placeholder="Tribhuvan University"
                      autoComplete="organization"
                      aria-invalid={Boolean(fieldErrors.university) || undefined}
                      aria-describedby={
                        fieldErrors.university ? "community-university-error" : undefined
                      }
                      style={{
                        width: "100%",
                        height: 44,
                        marginTop: 6,
                        padding: "0 14px",
                        borderRadius: 10,
                        border: "1px solid #d6dbe3",
                        fontSize: 14,
                        outline: 0,
                      }}
                    />
                    <FieldError id="community-university-error" message={fieldErrors.university} />
                  </div>

                  <div>
                    <label htmlFor="community-faculty" style={{ fontSize: 14, fontWeight: 600 }}>
                      Faculty or programme <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="community-faculty"
                      value={draft.faculty}
                      onChange={(event) => updateDraft("faculty", event.target.value)}
                      placeholder="Bachelor in Electronics Engineering"
                      autoComplete="off"
                      aria-invalid={Boolean(fieldErrors.faculty) || undefined}
                      aria-describedby={fieldErrors.faculty ? "community-faculty-error" : undefined}
                      style={{
                        width: "100%",
                        height: 44,
                        marginTop: 6,
                        padding: "0 14px",
                        borderRadius: 10,
                        border: "1px solid #d6dbe3",
                        fontSize: 14,
                        outline: 0,
                      }}
                    />
                    <FieldError id="community-faculty-error" message={fieldErrors.faculty} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label htmlFor="community-totalYears" style={{ fontSize: 14, fontWeight: 600 }}>
                      Total years <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="community-totalYears"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={draft.totalYears}
                      onChange={(event) => updateDraft("totalYears", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.totalYears) || undefined}
                      aria-describedby={
                        fieldErrors.totalYears ? "community-years-error" : "community-years-help"
                      }
                      style={{
                        width: "100%",
                        height: 44,
                        marginTop: 6,
                        padding: "0 14px",
                        borderRadius: 10,
                        border: "1px solid #d6dbe3",
                        fontSize: 14,
                        outline: 0,
                      }}
                    />
                    <FieldError id="community-years-error" message={fieldErrors.totalYears} />
                  </div>

                  <div>
                    <label htmlFor="community-totalSemesters" style={{ fontSize: 14, fontWeight: 600 }}>
                      Total semesters <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="community-totalSemesters"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={draft.totalSemesters}
                      onChange={(event) => updateDraft("totalSemesters", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.totalSemesters) || undefined}
                      aria-describedby={
                        fieldErrors.totalSemesters
                          ? "community-semesters-error"
                          : "community-semesters-help"
                      }
                      style={{
                        width: "100%",
                        height: 44,
                        marginTop: 6,
                        padding: "0 14px",
                        borderRadius: 10,
                        border: "1px solid #d6dbe3",
                        fontSize: 14,
                        outline: 0,
                      }}
                    />
                    <FieldError id="community-semesters-error" message={fieldErrors.totalSemesters} />
                  </div>
                </div>

                <div>
                  <label htmlFor="community-description" style={{ fontSize: 14, fontWeight: 600 }}>
                    Description <span style={{ color: "#777e88", fontWeight: 400 }}>optional</span>
                  </label>
                  <textarea
                    id="community-description"
                    value={draft.description}
                    onChange={(event) => updateDraft("description", event.target.value)}
                    rows={3}
                    placeholder="Who this community is for and what students will find inside."
                    aria-invalid={Boolean(fieldErrors.description) || undefined}
                    aria-describedby={
                      fieldErrors.description ? "community-description-error" : undefined
                    }
                    style={{
                      width: "100%",
                      marginTop: 6,
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #d6dbe3",
                      fontSize: 14,
                      outline: 0,
                      resize: "vertical",
                    }}
                  />
                  <FieldError id="community-description-error" message={fieldErrors.description} />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="ns-top-cta"
                style={{ marginTop: 20 }}
              >
                {submitting ? "Creating community…" : "Create community"}
              </button>
            </form>

            <aside
              style={{
                borderRadius: 12,
                border: "1px solid #d6dbe3",
                backgroundColor: "#f6f7f9",
                padding: 20,
              }}
              aria-live="polite"
            >
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#606774" }}>
                Generated structure
              </p>
              {previewTerms.length ? (
                <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
                  {Array.from({ length: totalYears }, (_, index) => index + 1).map((year) => (
                    <div key={year}>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#101114" }}>Year {year}</h3>
                      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {previewTerms
                          .filter((term) => term.yearNumber === year)
                          .map((term) => (
                            <span
                              key={term.semesterNumber}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                height: 30,
                                padding: "0 10px",
                                borderRadius: 999,
                                border: "1px solid #d6dbe3",
                                backgroundColor: "#ffffff",
                                fontSize: 12,
                                color: "#3f454e",
                              }}
                            >
                              Semester {term.semesterNumber}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ marginTop: 14, fontSize: 14, color: "#606774", lineHeight: 1.5 }}>
                  Enter a valid year and semester count to preview the generated slots.
                </p>
              )}
            </aside>
          </div>
        </section>
      ) : null}

      {/* Discovery Section: Filters + Community Grid */}
      <section className="ns-discovery" id="communities" aria-label="Communities discovery">
        {/* Sleek Sidebar Filters */}
        <aside className="ns-filters" aria-label="Community filters">
          <div className="ns-filters-header">
            <h2>Filters</h2>
            <button className="ns-clear-button" type="button" onClick={clearAllFilters}>
              Clear
            </button>
          </div>

          <div>
            {/* Location Group */}
            <div className="ns-filter-group">
              <p className="ns-filter-label">Location</p>
              <select className="ns-location-select" aria-label="Location" defaultValue="Nepal">
                <option>Nepal</option>
              </select>
            </div>

            {/* University Group */}
            <div className="ns-filter-group">
              <p className="ns-filter-label">University</p>
              <div className="ns-check-list">
                {availableUniversities.map((uni) => {
                  const checked = selectedUniversities.includes(uni);
                  return (
                    <label key={uni} className="ns-check-row">
                      <input
                        className="ns-filter-checkbox"
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUniversity(uni)}
                      />
                      <div className={`ns-custom-checkbox ${checked ? "is-checked" : ""}`}>
                        {checked ? (
                          <svg
                            viewBox="0 0 14 14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ width: 10, height: 10 }}
                          >
                            <polyline points="2.5 7 5.5 10 11.5 4" />
                          </svg>
                        ) : null}
                      </div>
                      <span>{uni}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Institute / Faculty Group */}
            <div className="ns-filter-group">
              <p className="ns-filter-label">Institute</p>
              <div className="ns-check-list">
                {availableInstitutes.map((inst) => {
                  const checked = selectedInstitutes.includes(inst);
                  return (
                    <label key={inst} className="ns-check-row">
                      <input
                        className="ns-filter-checkbox"
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleInstitute(inst)}
                      />
                      <div className={`ns-custom-checkbox ${checked ? "is-checked" : ""}`}>
                        {checked ? (
                          <svg
                            viewBox="0 0 14 14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ width: 10, height: 10 }}
                          >
                            <polyline points="2.5 7 5.5 10 11.5 4" />
                          </svg>
                        ) : null}
                      </div>
                      <span>{inst}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Level Group */}
            <div className="ns-filter-group">
              <p className="ns-filter-label">Level</p>
              <div className="ns-check-list">
                {availableLevels.map((lvl) => {
                  const checked = selectedLevels.includes(lvl);
                  return (
                    <label key={lvl} className="ns-check-row">
                      <input
                        className="ns-filter-checkbox"
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLevel(lvl)}
                      />
                      <div className={`ns-custom-checkbox ${checked ? "is-checked" : ""}`}>
                        {checked ? (
                          <svg
                            viewBox="0 0 14 14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ width: 10, height: 10 }}
                          >
                            <polyline points="2.5 7 5.5 10 11.5 4" />
                          </svg>
                        ) : null}
                      </div>
                      <span>{lvl}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* Results Area */}
        <div className="ns-results">
          {/* Header with Search */}
          <div className="ns-results-header">
            <div className="ns-results-heading">
              <h2>Browse Faculties</h2>
              <span className="ns-result-count" aria-live="polite">
                {totalItems} {totalItems === 1 ? "community" : "communities"}
              </span>
            </div>

            <label className="ns-search">
              <span className="sr-only" hidden>
                Search communities
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search university, institute, or programme"
                autoComplete="off"
              />
            </label>
          </div>

          {/* Cards Grid */}
          <div className="ns-community-grid">
            {paginatedCommunities.map((community) => (
              <CommunityCard key={community.id} community={community} signedIn={signedIn} />
            ))}
            {!totalItems ? (
              <div className="ns-empty-state" style={{ display: "block" }}>
                <strong>No communities found</strong>
                Try another search or clear your filters.
              </div>
            ) : null}
          </div>

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
