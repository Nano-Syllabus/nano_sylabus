"use client";
import { CommunitySwitcher } from "@/components/community-switcher";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ClipboardCheck,
  Copy,
  FileText,
  Link2,
  Mail,
  Megaphone,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Share2,
  Trophy,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";
import type {
  CommunityAnnouncement,
  CommunityHubData,
  CommunityHubPost,
} from "@/lib/data/community-hub";
import { DISCORD_STUDY_ROOM_URL } from "@/lib/product-links";
import { cn, titleCase } from "@/lib/utils";
import { CommunityLeaveControl } from "@/components/community-leave-control";
import { patchDashboardRunningSemester } from "@/lib/query/dashboard";

type CommunitySection = "overview" | "members";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kathmandu",
  }).format(new Date(value));
}

function relativeTime(value: string) {
  const seconds = Math.round((Date.parse(value) - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const intervals: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of intervals) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

function referralShareMessage(link: string) {
  return `Get 2 months of NanoSyllabus Pro for the price of 1. Save my referral, buy one month of Pro, and after payment approval your paid month gets a bonus month: ${link}`;
}

async function writeClipboardText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Some browsers expose Clipboard API but reject it outside their preferred context.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed");
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
      className="m-auto w-[min(92vw,620px)] rounded-2xl border border-border bg-bg-primary p-0 text-text-primary shadow-2xl backdrop:bg-black/45"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 id={titleId} className="font-display text-xl font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className={`flex size-10 items-center justify-center rounded-full hover:bg-bg-secondary ${focusRing}`}
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[72vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

function DiscordWatermark() {
  return (
    <svg
      className="pointer-events-none absolute left-[51%] sm:left-[54%] top-1/2 -translate-x-1/2 -translate-y-1/2 size-28 sm:size-32 select-none text-white/[0.12]"
      viewBox="0 0 127.14 96.36"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.92,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.15,53,91.08,65.69,84.69,65.69Z" />
    </svg>
  );
}

function getCommunityAbbreviation(community: { slug?: string; name: string }) {
  if (community.slug) {
    const cleanSlug = community.slug.replace(/[^a-zA-Z0-9]/g, "");
    if (cleanSlug.length >= 2 && cleanSlug.length <= 5) {
      return cleanSlug.toUpperCase();
    }
  }
  const words = community.name.trim().split(/\s+/);
  if (words.length > 1) {
    const acronym = words.map((w) => w[0]).join("").toUpperCase();
    if (acronym.length >= 2 && acronym.length <= 5) return acronym;
  }
  return community.slug?.split("-")[0].toUpperCase() || "HUB";
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-bg-primary p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-9 items-center justify-center rounded-xl bg-bg-secondary text-text-secondary">
          {icon}
        </span>
        <p className="font-display text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
          {value}
        </p>
      </div>
      <h3 className="mt-4 text-sm font-semibold">{label}</h3>
      <p className="mt-1 text-[11px] leading-5 text-text-muted sm:text-xs">{detail}</p>
    </article>
  );
}

export function CommunityHubClient({
  communityOptions = [],
  initialData,
  initialSection = "overview",
  memberRanking = "streak",
  initialInviteOpen = false,
}: {
  communityOptions?: import("@/lib/community-switch").CommunitySwitchOption[];
  initialData: CommunityHubData;
  initialSection?: CommunitySection;
  memberRanking?: "streak" | "today";
  initialInviteOpen?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { community } = initialData;
  const [section, setSection] = useState<CommunitySection>(initialSection);
  const [selectedTermId, setSelectedTermId] = useState(initialData.currentTermId);
  const [currentTermId, setCurrentTermId] = useState(initialData.currentTermId);
  const [announcements, setAnnouncements] = useState(initialData.announcements);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(initialInviteOpen);
  const [inviteMode, setInviteMode] = useState<"referral" | "community">("referral");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteExpiresAt, setInviteExpiresAt] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [referralLink, setReferralLink] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState("");
  const [referralCopied, setReferralCopied] = useState(false);
  const [referralShareNotice, setReferralShareNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>(
    Object.fromEntries(initialData.posts.map((post) => [post.id, post.voteCount])),
  );
  const [votedPosts, setVotedPosts] = useState(
    () => new Set(initialData.posts.filter((post) => post.viewerVoted).map((post) => post.id)),
  );
  const [votingPostId, setVotingPostId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [termSaving, setTermSaving] = useState(false);

  const currentTerm =
    community.terms.find((term) => term.id === currentTermId) || initialData.currentTerm;
  const selectedTerm = community.terms.find((term) => term.id === selectedTermId) || currentTerm;
  const selectedSubjects = initialData.subjects.filter(
    (subject) => subject.termId === selectedTerm.id,
  );
  const currentSubjects = initialData.subjects.filter(
    (subject) => subject.termId === currentTerm.id,
  );
  const groupedYears = useMemo(
    () =>
      Array.from(new Set(community.terms.map((term) => term.yearNumber))).map((year) => ({
        year,
        terms: community.terms.filter((term) => term.yearNumber === year),
      })),
    [community.terms],
  );

  const abbreviation = useMemo(
    () => getCommunityAbbreviation(community),
    [community],
  );

  const currentSemesterProgress = useMemo(() => {
    if (initialData.contentReadiness !== null && initialData.contentReadiness !== undefined) {
      return initialData.contentReadiness;
    }
    if (!currentSubjects.length) return 0;
    const total = currentSubjects.reduce((sum, s) => sum + (s.progress || 0), 0);
    return Math.round(total / currentSubjects.length);
  }, [initialData.contentReadiness, currentSubjects]);

  async function generateInvite() {
    setInviteLoading(true);
    setInviteError("");
    setCopied(false);
    try {
      const response = await fetch(
        `/api/communities/${encodeURIComponent(community.slug)}/hub/invites`,
        { method: "POST", headers: { Accept: "application/json" } },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        invite?: { token: string; expiresAt: string };
        error?: string;
      };
      if (!response.ok || !payload.invite) {
        setInviteError(payload.error || "Could not create an invite. Try again.");
        return;
      }
      setInviteLink(`${window.location.origin}/communities/invite/${payload.invite.token}`);
      setInviteExpiresAt(payload.invite.expiresAt);
    } catch {
      setInviteError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setInviteLoading(false);
    }
  }

  const generateReferral = useCallback(async () => {
    setReferralLoading(true);
    setReferralError("");
    setReferralCopied(false);
    try {
      const response = await fetch("/api/billing/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        referral?: { code: string; link: string };
        error?: string;
      };
      if (!response.ok || !payload.referral) {
        setReferralError(payload.error || "Could not create a referral link. Try again.");
        return;
      }
      setReferralCode(payload.referral.code);
      setReferralLink(payload.referral.link);
    } catch {
      setReferralError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setReferralLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialInviteOpen) void generateReferral();
  }, [generateReferral, initialInviteOpen]);

  function openPeerInvite() {
    setInviteMode("referral");
    setInviteOpen(true);
    if (!referralLink && !referralLoading) void generateReferral();
  }

  async function copyReferral() {
    if (!referralLink) return;
    setReferralError("");
    try {
      await writeClipboardText(referralLink);
      setReferralCopied(true);
      setReferralShareNotice("Referral link copied.");
      window.setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      setReferralError("Could not copy automatically. Select and copy the link above.");
    }
  }

  async function shareReferral(channel: "whatsapp" | "discord" | "email" | "native") {
    if (!referralLink) return;
    const message = referralShareMessage(referralLink);
    setReferralError("");
    setReferralShareNotice("");

    if (channel === "whatsapp") {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer",
      );
      setReferralShareNotice("Opened WhatsApp sharing.");
      return;
    }
    if (channel === "email") {
      window.location.href = `mailto:?subject=${encodeURIComponent("Join me on NanoSyllabus Pro")}&body=${encodeURIComponent(message)}`;
      setReferralShareNotice("Opened your email app.");
      return;
    }
    if (channel === "discord") {
      window.open(DISCORD_STUDY_ROOM_URL, "_blank", "noopener,noreferrer");
      try {
        await writeClipboardText(message);
        setReferralShareNotice("Discord opened. Paste the copied referral message.");
      } catch {
        setReferralError(
          "Discord opened, but the message could not be copied. Copy the link manually.",
        );
      }
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: "NanoSyllabus Pro referral",
          text: message,
          url: referralLink,
        });
        setReferralShareNotice("Referral shared.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setReferralError("Sharing did not open. Copy the referral link instead.");
      }
      return;
    }
    try {
      await writeClipboardText(message);
      setReferralCopied(true);
      setReferralShareNotice("Sharing is unavailable here, so the referral message was copied.");
      window.setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      setReferralError("Sharing is unavailable in this browser. Select and copy the link above.");
    }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    setInviteError("");
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setInviteError("Could not copy automatically. Select and copy the link above.");
    }
  }

  async function vote(post: CommunityHubPost) {
    if (votedPosts.has(post.id) || votingPostId) return;
    setVotingPostId(post.id);
    setActionError("");
    try {
      const response = await fetch(`/api/community-posts/${encodeURIComponent(post.id)}/vote`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        voteCount?: number;
        error?: string;
      };
      if (!response.ok) {
        setActionError(payload.error || "Could not record your vote. Try again.");
        return;
      }
      setVoteCounts((current) => ({ ...current, [post.id]: Number(payload.voteCount) || 0 }));
      setVotedPosts((current) => new Set([...current, post.id]));
      router.refresh();
    } catch {
      setActionError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setVotingPostId(null);
    }
  }

  async function saveCurrentTerm() {
    if (selectedTermId === currentTermId) return;
    setTermSaving(true);
    setActionError("");
    try {
      const response = await fetch(
        `/api/communities/${encodeURIComponent(community.slug)}/membership`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ termId: selectedTermId }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        currentTermId?: string;
        error?: string;
      };
      if (!response.ok || payload.currentTermId !== selectedTermId) {
        setActionError(payload.error || "Could not update your semester. Try again.");
        return;
      }
      setCurrentTermId(selectedTermId);
      patchDashboardRunningSemester(queryClient, community.slug, selectedTermId);
      router.refresh();
    } catch {
      setActionError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setTermSaving(false);
    }
  }

  return (
    <main className="student-page-frame">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="type-student-page-title text-text-primary">
            Community Hub
          </h1>
        </div>
        {communityOptions.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <CommunitySwitcher options={communityOptions} selectedSlug={community.slug} />
          </div>
        ) : null}
      </div>

      <section className="relative isolate overflow-hidden rounded-[24px] sm:rounded-[28px] bg-[#1242be] px-6 py-7 text-white shadow-lg sm:px-8 sm:py-8 lg:px-9 lg:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_70%)]" />
        <DiscordWatermark />

        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
          <div className="max-w-3xl">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                <span className="size-1.5 rounded-full bg-[#4ade80]" />
                {initialData.canManage ? "Community creator" : "Joined community"}
              </span>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-white/80 sm:text-sm">
                <span>{community.university}</span>
                <span className="text-white/50" aria-hidden="true">
                  ·
                </span>
                <span>{community.faculty}</span>
              </div>
            </div>

            <h1 className="mt-3.5 font-display text-5xl font-black tracking-tight text-white sm:text-6xl leading-none">
              {abbreviation}
            </h1>

            <p className="mt-2.5 font-serif text-2xl font-bold italic tracking-wide text-[#fde047] sm:text-3xl lg:text-[32px]">
              Your syllabus. Your people.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-medium text-white/90 sm:text-sm">
              <span>
                <strong className="font-bold text-white">{community.totalYears}</strong> years
              </span>
              <span className="text-white/40" aria-hidden="true">
                |
              </span>
              <span>
                <strong className="font-bold text-white">{community.totalSemesters}</strong>{" "}
                semesters
              </span>
              <span className="text-white/40" aria-hidden="true">
                |
              </span>
              <span>
                <strong className="font-bold text-white">{initialData.subjects.length}</strong>{" "}
                subjects
              </span>
              <span className="text-white/40" aria-hidden="true">
                |
              </span>
              <span>
                <strong className="font-bold text-white">{initialData.memberCount}</strong> members
              </span>
            </div>
          </div>

          <div className="border-t border-white/20 pt-6 lg:border-l lg:border-t-0 lg:py-2 lg:pl-8">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">
              Current semester
            </p>
            <p className="mt-1.5 font-display text-xl font-bold text-white sm:text-2xl">
              Year {currentTerm.yearNumber} · Semester {currentTerm.semesterNumber}
            </p>
            <p className="mt-1 text-xs text-white/80 sm:text-sm">
              {currentSubjects.length} subject{currentSubjects.length === 1 ? "" : "s"} ·{" "}
              {currentSubjects.reduce((sum, subject) => sum + Number(subject.topicCount || 0), 0)}{" "}
              topics ready
            </p>

            <div className="mt-4 flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/25">
                <div
                  className="h-full rounded-full bg-[#d4ff36] transition-all duration-500"
                  style={{ width: `${currentSemesterProgress}%` }}
                />
              </div>
              <span className="text-xs font-bold tabular-nums text-[#d4ff36]">
                {currentSemesterProgress}%
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setAnnouncementsOpen(true)}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:text-sm ${focusRing}`}
              >
                <Megaphone className="size-4" aria-hidden="true" /> Announcements
              </button>
              <button
                type="button"
                onClick={openPeerInvite}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#d4ff36] px-3 text-xs font-bold text-black shadow-sm transition-colors hover:bg-[#c2f022] sm:text-sm ${focusRing}`}
              >
                <Users className="size-4" aria-hidden="true" /> Invite peer
              </button>
            </div>
          </div>
        </div>
      </section>

      <nav
        className="mt-7 flex gap-6 overflow-x-auto border-b border-border"
        aria-label="Community sections"
      >
        {(["overview", "members"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={section === item}
            onClick={() => setSection(item)}
            className={cn(
              `relative min-h-11 shrink-0 px-1 pb-3 text-sm font-medium capitalize text-text-muted hover:text-text-primary ${focusRing}`,
              section === item &&
                "text-text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--community-accent)]",
            )}
          >
            {item}
          </button>
        ))}
      </nav>

      {actionError ? (
        <div
          role="alert"
          className="mt-6 flex items-start justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="text-sm text-destructive">{actionError}</p>
          <button
            type="button"
            onClick={() => setActionError("")}
            className={`min-h-10 px-2 text-sm font-medium ${focusRing}`}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {section === "overview" ? (
        <CommunityOverview data={initialData} onOpenReferral={openPeerInvite} />
      ) : null}
      {section === "members" ? (
        <CommunityMembers data={initialData} ranking={memberRanking} />
      ) : null}

      {!initialData.canManage ? (
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
          <p className="text-xs text-text-muted">
            You are a member of {titleCase(community.name)}.
          </p>
          <CommunityLeaveControl
            key={community.id}
            community={community}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50/50 px-4 py-1.5 text-xs font-semibold text-rose-600 hover:border-rose-300 hover:bg-rose-100/70 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400"
          />
        </div>
      ) : null}

      <Modal
        open={announcementsOpen}
        title="Community announcements"
        onClose={() => setAnnouncementsOpen(false)}
      >
        <AnnouncementsPanel
          communitySlug={community.slug}
          canManage={initialData.canManage}
          announcements={announcements}
          onChange={setAnnouncements}
        />
      </Modal>

      <Modal
        open={inviteOpen}
        title={inviteMode === "referral" ? "Win 1 Month Free Subscription" : "Invite to community"}
        onClose={() => setInviteOpen(false)}
      >
        <div
          className="grid grid-cols-2 rounded-xl bg-bg-secondary p-1"
          role="tablist"
          aria-label="Invite type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={inviteMode === "referral"}
            onClick={() => setInviteMode("referral")}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${focusRing} ${inviteMode === "referral" ? "bg-bg-primary shadow-sm" : "text-text-secondary"}`}
          >
            Refer Pro
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inviteMode === "community"}
            onClick={() => setInviteMode("community")}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${focusRing} ${inviteMode === "community" ? "bg-bg-primary shadow-sm" : "text-text-secondary"}`}
          >
            Invite community
          </button>
        </div>

        {inviteMode === "referral" ? (
          <>
            <p className="mt-5 text-base leading-7 text-text-secondary">
              Active paid Pro members can refer a friend. When your friend buys
              <strong className="text-text-primary"> NanoSyllabus Pro</strong>, they receive
              <strong className="text-success"> 2 months for the price of 1</strong> and you receive
              one free month after payment approval.
            </p>

            <section
              className="mt-6 rounded-xl border border-success/45 bg-success/5 p-5"
              aria-labelledby="referral-how-it-works"
            >
              <div className="flex items-center gap-2 text-success">
                <Check className="size-5" aria-hidden="true" />
                <h3 id="referral-how-it-works" className="text-base font-semibold">
                  How it works
                </h3>
              </div>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-text-primary">
                <li>
                  You must have an active paid Pro subscription to create and use your referral
                  link.
                </li>
                <li>Your friend saves the referral and buys one month of Individual Pro.</li>
                <li>
                  After payment approval, your friend gets 60 days total and your Pro plan gets 30
                  extra days.
                </li>
              </ol>
            </section>
            {referralError ? (
              <div
                role="alert"
                className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3"
              >
                <p className="text-sm text-destructive">{referralError}</p>
                <button
                  type="button"
                  onClick={generateReferral}
                  className={`min-h-10 shrink-0 rounded-lg border border-border px-3 text-sm font-semibold ${focusRing}`}
                >
                  Retry
                </button>
              </div>
            ) : null}
            {referralLink ? (
              <div className="mt-5">
                <label htmlFor="billing-referral-link" className="text-sm font-semibold">
                  Your referral link
                </label>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    id="billing-referral-link"
                    readOnly
                    value={referralLink}
                    className={`min-h-12 min-w-0 rounded-xl border border-border bg-bg-secondary px-4 font-mono-ui text-sm ${focusRing}`}
                  />
                  <button
                    type="button"
                    onClick={copyReferral}
                    className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-text-primary px-5 text-sm font-semibold text-text-inverse ${focusRing}`}
                  >
                    {referralCopied ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Copy className="size-4" aria-hidden="true" />
                    )}
                    {referralCopied ? "Copied" : "Copy link"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Code {referralCode} · rewards are tracked in billing and issued once.
                </p>

                <div className="mt-5">
                  <p className="text-sm font-semibold">Share via</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(referralShareMessage(referralLink))}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        setReferralError("");
                        setReferralShareNotice("WhatsApp opened with your referral message.");
                      }}
                      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-bg-secondary ${focusRing}`}
                    >
                      <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
                    </a>
                    <button
                      type="button"
                      onClick={() => void shareReferral("discord")}
                      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-bg-secondary ${focusRing}`}
                    >
                      <MessageCircle className="size-4" aria-hidden="true" /> Discord
                    </button>
                    <a
                      href={`mailto:?subject=${encodeURIComponent("Join me on NanoSyllabus Pro")}&body=${encodeURIComponent(referralShareMessage(referralLink))}`}
                      onClick={() => {
                        setReferralError("");
                        setReferralShareNotice(
                          "Your email app is opening with the referral message.",
                        );
                      }}
                      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-bg-secondary ${focusRing}`}
                    >
                      <Mail className="size-4" aria-hidden="true" /> Email
                    </a>
                    <button
                      type="button"
                      onClick={() => void shareReferral("native")}
                      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-bg-secondary ${focusRing}`}
                    >
                      <Share2 className="size-4" aria-hidden="true" /> More
                    </button>
                  </div>
                </div>

                <p className="mt-3 min-h-5 text-sm text-success" aria-live="polite">
                  {referralShareNotice}
                </p>

                <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setInviteOpen(false)}
                    className={`min-h-11 rounded-xl border border-border px-5 text-sm font-semibold hover:bg-bg-secondary ${focusRing}`}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void shareReferral("native")}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-text-primary px-5 text-sm font-semibold text-text-inverse ${focusRing}`}
                  >
                    <Share2 className="size-4" aria-hidden="true" /> Share now
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="mt-5 rounded-xl border border-border bg-bg-secondary p-4"
                aria-live="polite"
              >
                <div className="flex items-center gap-3">
                  <RefreshCw
                    className={`size-4 text-text-secondary ${referralLoading ? "animate-spin motion-reduce:animate-none" : ""}`}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-semibold">Preparing your unique link</p>
                    <p className="mt-1 text-xs text-text-muted">
                      The same real link is reused for your account.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mt-4 rounded-xl bg-bg-secondary p-4">
              <div className="flex items-start gap-3">
                <Link2 className="mt-0.5 size-5 shrink-0 text-text-secondary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">One real community invitation</p>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">
                    The link expires in seven days and can be accepted by up to 25 peers. A student
                    can belong to one active community at a time.
                  </p>
                </div>
              </div>
            </div>
            {inviteError ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {inviteError}
              </p>
            ) : null}
            {inviteLink ? (
              <div className="mt-5">
                <label htmlFor="community-invite-link" className="text-sm font-medium">
                  Share this link
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="community-invite-link"
                    readOnly
                    value={inviteLink}
                    className={`min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg-secondary px-3 text-sm ${focusRing}`}
                  />
                  <button
                    type="button"
                    onClick={copyInvite}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-text-primary px-4 text-sm font-semibold text-text-inverse ${focusRing}`}
                  >
                    {copied ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Copy className="size-4" aria-hidden="true" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Expires {formatDate(inviteExpiresAt)}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={generateInvite}
                disabled={inviteLoading}
                aria-busy={inviteLoading}
                className={`mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-text-primary px-5 text-sm font-semibold text-text-inverse disabled:opacity-60 ${focusRing}`}
              >
                {inviteLoading ? (
                  <RefreshCw
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <UserRoundPlus className="size-4" aria-hidden="true" />
                )}
                {inviteLoading ? "Creating invite…" : "Create invitation link"}
              </button>
            )}
          </>
        )}
      </Modal>
    </main>
  );
}

function CommunityOverview({
  data,
  onOpenReferral,
}: {
  data: CommunityHubData;
  onOpenReferral: () => void;
}) {
  return (
    <div className="grid gap-8 pt-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
      <div className="min-w-0">
        <section className="grid gap-3 sm:grid-cols-2" aria-label="Community metrics">
          <MetricCard
            icon={<Users className="size-5" aria-hidden="true" />}
            label="Total members"
            value={formatNumber(data.memberCount)}
            detail="Active community memberships"
          />
          <MetricCard
            icon={<BookOpen className="size-5" aria-hidden="true" />}
            label="Total subjects"
            value={formatNumber(data.subjects.length)}
            detail={`Across ${data.community.totalSemesters} generated semesters`}
          />
          <MetricCard
            icon={<FileText className="size-5" aria-hidden="true" />}
            label="Total materials"
            value={formatNumber(data.materialCount)}
            detail="Files in linked subject repositories"
          />
          <MetricCard
            icon={<ClipboardCheck className="size-5" aria-hidden="true" />}
            label="Content readiness"
            value={data.contentReadiness === null ? "—" : `${data.contentReadiness}%`}
            detail="Subjects containing both a syllabus and Question Bank"
          />
        </section>

        <section
          className="mt-8 grid gap-4 sm:grid-cols-2"
          aria-label="Community invitations and study room"
        >
          <article className="flex min-h-56 flex-col rounded-[22px] border border-border bg-bg-primary p-6 sm:p-7 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <span className="flex size-11 items-center justify-center rounded-full border border-border/80 bg-bg-primary text-[#1768ff] shadow-sm">
              <UserRoundPlus className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
              Peer referral
            </p>
            <h3 className="mt-2.5 text-[22px] font-bold tracking-tight text-text-primary">
              Give 1 month. Get 1 month.
            </h3>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-text-secondary">
              After your friend&apos;s first paid Pro subscription is approved, both accounts get 30
              days automatically.
            </p>
            <button
              type="button"
              onClick={onOpenReferral}
              className={`mt-6 inline-flex min-h-11 items-center justify-center gap-2.5 self-start rounded-full bg-[#101114] px-6 text-sm font-semibold text-white shadow-sm hover:bg-[#26282d] hover:-translate-y-0.5 transition-all duration-150 active:translate-y-0 ${focusRing}`}
            >
              Create referral link <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </article>

          <article className="flex min-h-56 flex-col rounded-[22px] border border-border bg-bg-primary p-6 sm:p-7 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <span className="flex size-11 items-center justify-center rounded-full border border-border/80 bg-bg-secondary text-[#5865F2] shadow-sm">
              <MessageCircle className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
              Discord co-study server
            </p>
            <h3 className="mt-2.5 text-[22px] font-bold tracking-tight text-text-primary">
              Discord Study Room
            </h3>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-text-secondary">
              Join the NanoSyllabus Discord room for voice study, questions, and peer help.
            </p>
            <a
              href={DISCORD_STUDY_ROOM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-6 inline-flex min-h-11 items-center justify-center gap-2.5 self-start rounded-full border border-border bg-bg-primary px-6 text-sm font-semibold text-text-primary hover:bg-bg-secondary hover:-translate-y-0.5 transition-all duration-150 active:translate-y-0 ${focusRing}`}
            >
              Join Discord <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </article>
        </section>
      </div>

      <CommunityTodayLeaderboard data={data} />
    </div>
  );
}

function CommunityTodayLeaderboard({ data }: { data: CommunityHubData }) {
  const members = [...data.members].sort(
    (left, right) =>
      right.todayAttempts - left.todayAttempts ||
      right.streak - left.streak ||
      right.xp - left.xp ||
      left.joinedAt.localeCompare(right.joinedAt),
  );
  const visible = members.slice(0, 5);
  const viewer = members.find((member) => member.isViewer);
  if (viewer && !visible.some((member) => member.id === viewer.id)) visible.push(viewer);

  return (
    <aside
      className="min-w-0 rounded-2xl border border-border bg-bg-primary p-5 sm:p-6"
      aria-labelledby="community-today-leaderboard-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-text-secondary">
            <Trophy className="size-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">Today</p>
          </div>
          <h2
            id="community-today-leaderboard-heading"
            className="mt-2 font-display text-xl font-semibold"
          >
            Community leaderboard
          </h2>
          <p className="mt-1 text-sm text-text-secondary">{data.community.name}</p>
        </div>
        <p className="inline-flex min-h-10 items-center text-sm text-text-secondary">
          {formatNumber(data.memberCount)} members
        </p>
      </div>

      <div className="mt-5 grid grid-cols-[28px_minmax(0,1fr)_42px_42px] gap-2 border-b border-border px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted sm:grid-cols-[34px_minmax(0,1fr)_48px_48px] sm:text-[11px]">
        <span>Rank</span>
        <span>Member</span>
        <span className="text-right">Today</span>
        <span className="text-right">Streak</span>
      </div>
      {visible.length ? (
        <ol>
          {visible.map((member, index) => (
            <li
              key={member.id}
              className="grid grid-cols-[28px_minmax(0,1fr)_42px_42px] items-center gap-2 border-t border-border px-1 py-3 text-sm first:border-t-0 sm:grid-cols-[34px_minmax(0,1fr)_48px_48px]"
            >
              <span className="text-xs font-semibold text-text-muted tabular-nums">
                #{index + 1}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-xs font-semibold",
                    member.isViewer &&
                      "bg-[var(--community-accent)]/15 text-[var(--community-accent)] ring-1 ring-[var(--community-accent)]/30",
                  )}
                >
                  {member.initials}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="truncate font-medium">{member.name}</span>
                  {member.isViewer ? (
                    <span className="shrink-0 rounded-full bg-[var(--community-accent)]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--community-accent)]">
                      You
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="text-right font-semibold tabular-nums">{member.todayAttempts}</span>
              <span className="text-right text-text-secondary tabular-nums">
                {member.streak}d
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-10 text-center text-sm text-text-secondary">No activity yet today.</p>
      )}

      <div className="mt-3 border-t border-border pt-3 text-center">
        <Link
          href={`/app/community?community=${encodeURIComponent(data.community.slug)}&tab=members&sort=today`}
          className={`inline-flex min-h-10 items-center gap-1.5 px-3 text-sm font-semibold text-[var(--community-accent)] hover:underline ${focusRing}`}
        >
          View full leaderboard <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}

function CommunitySubjects({
  data,
  groupedYears,
  selectedTermId,
  currentTermId,
  selectedSubjects,
  termSaving,
  onSelectTerm,
  onSaveCurrentTerm,
}: {
  data: CommunityHubData;
  groupedYears: Array<{ year: number; terms: CommunityHubData["community"]["terms"] }>;
  selectedTermId: string;
  currentTermId: string;
  selectedSubjects: CommunityHubData["subjects"];
  termSaving: boolean;
  onSelectTerm: (id: string) => void;
  onSaveCurrentTerm: () => void;
}) {
  const selectedTerm = data.community.terms.find((term) => term.id === selectedTermId)!;
  return (
    <section className="pt-8" aria-labelledby="community-subjects-heading">
      <div className="flex flex-col gap-6 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Academic structure
          </p>
          <h2 id="community-subjects-heading" className="mt-2 font-display text-2xl font-semibold">
            Choose a semester
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Your current semester controls the subjects highlighted across the hub.
          </p>
        </div>
        {selectedTermId !== currentTermId ? (
          <button
            type="button"
            onClick={onSaveCurrentTerm}
            disabled={termSaving}
            aria-busy={termSaving}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-text-primary px-5 text-sm font-semibold text-text-inverse disabled:opacity-60 ${focusRing}`}
          >
            {termSaving ? (
              <RefreshCw
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            {termSaving ? "Saving…" : `Make Semester ${selectedTerm.semesterNumber} current`}
          </button>
        ) : (
          <span className="inline-flex min-h-10 items-center rounded-full bg-note-green px-4 text-sm font-medium text-success">
            Current semester
          </span>
        )}
      </div>
      <div className="grid gap-8 pt-7 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-6">
          {groupedYears.map((group) => (
            <div key={group.year}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Year {group.year}
              </h3>
              <div className="mt-2 space-y-1">
                {group.terms.map((term) => (
                  <button
                    key={term.id}
                    type="button"
                    onClick={() => onSelectTerm(term.id)}
                    className={cn(
                      `flex min-h-11 w-full items-center justify-between border-l-2 px-4 py-2 text-left text-sm hover:bg-bg-secondary ${focusRing}`,
                      term.id === selectedTermId
                        ? "border-[var(--community-accent)] bg-bg-secondary font-semibold"
                        : "border-transparent text-text-secondary",
                    )}
                  >
                    Semester {term.semesterNumber}
                    {term.id === currentTermId ? (
                      <Check className="size-4 text-success" aria-label="Current semester" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {selectedSubjects.length ? (
          <div className="divide-y divide-border border-y border-border">
            {selectedSubjects.map((subject) => (
              <article
                key={subject.id}
                className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-center"
              >
                <div>
                  <h3 className="font-semibold">{titleCase(subject.name)}</h3>
                  <p className="mt-1 text-sm text-text-muted">
                    {subject.code || "Community subject"} ·{" "}
                    {subject.topicCount === null
                      ? "Topics unavailable"
                      : `${subject.topicCount} extracted topics`}{" "}
                    ·{" "}
                    {subject.materialCount === null
                      ? "Materials unavailable"
                      : `${subject.materialCount} materials`}
                  </p>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-text-muted">
                    <span>Readiness</span>
                    <span>{subject.progress === null ? "—" : `${subject.progress}%`}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-secondary">
                    <div
                      className="h-full rounded-full bg-[var(--community-accent)]"
                      style={{ width: `${Math.max(0, Math.min(100, subject.progress || 0))}%` }}
                    />
                  </div>
                </div>
                <Link
                  href={`/app/chat?community=${encodeURIComponent(data.community.slug)}&semester=${encodeURIComponent(subject.termId)}&librarySubject=${encodeURIComponent(subject.slug)}`}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-bg-secondary ${focusRing}`}
                >
                  Open <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
            <BookOpen className="size-8 text-text-muted" aria-hidden="true" />
            <h3 className="mt-4 font-semibold">No subjects in this semester</h3>
            <p className="mt-2 max-w-md text-sm text-text-secondary">
              The community creator has not attached any subjects here yet.
            </p>
            {data.canManage ? (
              <Link
                href={`/teachers?view=communities&community=${encodeURIComponent(data.community.slug)}`}
                className={`mt-5 inline-flex min-h-10 items-center rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse ${focusRing}`}
              >
                Add subjects
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function CommunityForum({
  data,
  posts,
  voteCounts,
  votedPosts,
  votingPostId,
  onVote,
}: {
  data: CommunityHubData;
  posts: CommunityHubPost[];
  voteCounts: Record<string, number>;
  votedPosts: Set<string>;
  votingPostId: string | null;
  onVote: (post: CommunityHubPost) => void;
}) {
  return (
    <section className="pt-8" aria-labelledby="community-forum-heading">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Subject forum
          </p>
          <h2 id="community-forum-heading" className="mt-2 font-display text-2xl font-semibold">
            Useful material rises together
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Resources are reviewed by members and merge into the linked subject library at{" "}
            {data.community.contributionThreshold} votes.
          </p>
        </div>
        {data.subjects[0] ? (
          <Link
            href={`/app/communities/${encodeURIComponent(data.community.slug)}/subjects/${encodeURIComponent(data.subjects[0].slug)}`}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-text-primary px-5 text-sm font-semibold text-text-inverse hover:opacity-90 ${focusRing}`}
          >
            Contribute <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {posts.length ? (
        <div className="mt-6 divide-y divide-border border-y border-border">
          {posts.map((post) => {
            const votes = voteCounts[post.id] || 0;
            const complete =
              post.status === "merged" || votes >= data.community.contributionThreshold;
            return (
              <article
                key={post.id}
                className="grid gap-5 py-5 md:grid-cols-[minmax(0,1fr)_180px] md:items-center"
              >
                <div className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-xs font-semibold">
                    {post.authorInitials}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <span className="font-medium text-text-secondary">{post.authorName}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={post.createdAt}>{relativeTime(post.createdAt)}</time>
                      <span className="rounded-full bg-bg-secondary px-2 py-1">
                        {post.postType === "resource" ? post.shelf : "Discussion"}
                      </span>
                    </div>
                    <h3 className="mt-2 font-semibold">{post.title}</h3>
                    {post.body ? (
                      <p className="mt-1 line-clamp-3 text-sm leading-6 text-text-secondary">
                        {post.body}
                      </p>
                    ) : null}
                    <Link
                      href={`/app/communities/${encodeURIComponent(data.community.slug)}/subjects/${encodeURIComponent(post.subjectSlug)}`}
                      className={`mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-text-secondary underline underline-offset-4 ${focusRing}`}
                    >
                      {post.subjectName}
                    </Link>
                  </div>
                </div>
                <div className="md:text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {votes} / {data.community.contributionThreshold} votes
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-secondary">
                    <div
                      className="h-full bg-[var(--community-accent)] transition-[width] motion-reduce:transition-none"
                      style={{
                        width: `${Math.min(100, (votes / data.community.contributionThreshold) * 100)}%`,
                      }}
                    />
                  </div>
                  {complete ? (
                    <span className="mt-3 inline-flex min-h-10 items-center rounded-full bg-note-green px-4 text-sm font-medium text-success">
                      Merged to library
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onVote(post)}
                      disabled={votedPosts.has(post.id) || Boolean(votingPostId)}
                      aria-busy={votingPostId === post.id}
                      className={`mt-3 min-h-10 rounded-full border border-border px-4 text-sm font-medium hover:bg-bg-secondary disabled:opacity-60 ${focusRing}`}
                    >
                      {votingPostId === post.id
                        ? "Voting…"
                        : votedPosts.has(post.id)
                          ? "Voted"
                          : "Upvote"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
          <MessageCircle className="size-9 text-text-muted" aria-hidden="true" />
          <h3 className="mt-4 font-semibold">No posts yet</h3>
          <p className="mt-2 max-w-md text-sm text-text-secondary">
            Open a subject to start a discussion or contribute its first study resource.
          </p>
          {data.subjects[0] ? (
            <Link
              href={`/app/communities/${encodeURIComponent(data.community.slug)}/subjects/${encodeURIComponent(data.subjects[0].slug)}`}
              className={`mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse ${focusRing}`}
            >
              Open a subject <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CommunityMembers({ data, ranking }: { data: CommunityHubData; ranking: "streak" | "today" }) {
  const members =
    ranking === "today"
      ? [...data.members].sort(
          (left, right) =>
            right.todayAttempts - left.todayAttempts ||
            right.streak - left.streak ||
            right.completedChallenges - left.completedChallenges ||
            left.joinedAt.localeCompare(right.joinedAt),
        )
      : data.members;

  return (
    <section className="pt-8" aria-labelledby="community-members-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          {formatNumber(data.memberCount)} active members
        </p>
        <h2 id="community-members-heading" className="mt-2 font-display text-2xl font-semibold">
          {ranking === "today"
            ? "Full daily leaderboard"
            : `People studying ${titleCase(data.community.name)}`}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {ranking === "today"
            ? "Ranked by today's real challenge activity, then current streak."
            : "Ranked by current study streak, with completed challenges as the tie-breaker."}
        </p>
      </div>
      {members.length ? (
        <div className="mt-6 border-y border-border">
          <div className="hidden grid-cols-[56px_44px_minmax(0,1fr)_120px_100px] gap-3 border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted sm:grid">
            <span>Rank</span>
            <span aria-hidden="true" />
            <span>Member</span>
            <span>{ranking === "today" ? "Today" : "Completed"}</span>
            <span className="text-right">Streak</span>
          </div>
          <div className="divide-y divide-border">
            {members.map((member, index) => (
              <div
                key={member.id}
                className={cn(
                  "grid gap-3 px-3 py-4 sm:grid-cols-[56px_44px_minmax(0,1fr)_120px_100px] sm:items-center",
                  member.isViewer && "bg-bg-secondary",
                )}
              >
                <span className="text-sm font-semibold tabular-nums text-text-muted">
                  #{ranking === "today" ? index + 1 : member.rank}
                </span>
                <span className="flex size-11 items-center justify-center rounded-full bg-bg-secondary text-xs font-semibold">
                  {member.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {member.name}
                    {member.isViewer ? " (you)" : ""}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {ranking === "today"
                      ? `${formatNumber(member.completedChallenges)} completed challenges`
                      : member.role === "creator"
                        ? "Community creator"
                        : `Joined ${formatDate(member.joinedAt)}`}
                  </p>
                </div>
                {ranking === "today" ? (
                  <>
                    <span className="text-sm font-semibold tabular-nums text-text-secondary">
                      {formatNumber(member.todayAttempts)} today
                    </span>
                    <span className="text-sm font-semibold tabular-nums sm:text-right">
                      {member.streak}d streak
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm tabular-nums text-text-secondary">
                      {member.completedChallenges} challenges
                    </span>
                    <span className="text-sm font-semibold tabular-nums sm:text-right">
                      {member.streak}d streak
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {data.memberCount > members.length ? (
        <p className="mt-4 text-sm text-text-muted">
          Showing the top {members.length} contributors.
        </p>
      ) : null}
    </section>
  );
}

function AnnouncementsPanel({
  communitySlug,
  canManage,
  announcements,
  onChange,
}: {
  communitySlug: string;
  canManage: boolean;
  announcements: CommunityAnnouncement[];
  onChange: (value: CommunityAnnouncement[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/communities/${encodeURIComponent(communitySlug)}/hub/announcements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ title, body }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        announcement?: { id: string; title: string; body: string; published_at: string };
        error?: string;
      };
      if (!response.ok || !payload.announcement) {
        setError(payload.error || "Could not publish the announcement. Try again.");
        return;
      }
      onChange([
        {
          id: payload.announcement.id,
          authorName: "You",
          title: payload.announcement.title,
          body: payload.announcement.body,
          publishedAt: payload.announcement.published_at,
        },
        ...announcements,
      ]);
      setTitle("");
      setBody("");
    } catch {
      setError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function archive(id: string) {
    setDeletingId(id);
    setError("");
    try {
      const response = await fetch(
        `/api/communities/${encodeURIComponent(communitySlug)}/hub/announcements/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { Accept: "application/json" } },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not archive the announcement. Try again.");
        return;
      }
      onChange(announcements.filter((announcement) => announcement.id !== id));
    } catch {
      setError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {canManage ? (
        <form
          onSubmit={publish}
          className="rounded-xl border border-border bg-bg-secondary p-4"
          aria-busy={submitting}
        >
          <div className="flex items-center gap-2">
            <Megaphone className="size-4 text-text-secondary" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Publish an announcement</h3>
          </div>
          <label htmlFor="announcement-title" className="mt-4 block text-sm font-medium">
            Title
          </label>
          <input
            id="announcement-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            minLength={3}
            maxLength={140}
            autoComplete="off"
            className={`mt-2 min-h-11 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm ${focusRing}`}
          />
          <label htmlFor="announcement-body" className="mt-4 block text-sm font-medium">
            Message
          </label>
          <textarea
            id="announcement-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            minLength={3}
            maxLength={2000}
            rows={4}
            className={`mt-2 w-full resize-y rounded-xl border border-border bg-bg-primary px-3 py-3 text-sm ${focusRing}`}
          />
          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className={`mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-semibold text-text-inverse disabled:opacity-60 ${focusRing}`}
          >
            {submitting ? "Publishing…" : "Publish announcement"}
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {announcements.length ? (
        <div className="mt-5 divide-y divide-border border-y border-border">
          {announcements.map((announcement) => (
            <article key={announcement.id} className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{announcement.title}</h3>
                  <p className="mt-1 text-xs text-text-muted">
                    {announcement.authorName} · {formatDate(announcement.publishedAt)}
                  </p>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => archive(announcement.id)}
                    disabled={Boolean(deletingId)}
                    className={`min-h-10 shrink-0 px-2 text-xs font-medium text-text-muted hover:text-destructive disabled:opacity-60 ${focusRing}`}
                  >
                    {deletingId === announcement.id ? "Archiving…" : "Archive"}
                  </button>
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                {announcement.body}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="py-10 text-center">
          <Megaphone className="mx-auto size-8 text-text-muted" aria-hidden="true" />
          <h3 className="mt-3 font-semibold">No announcements yet</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Important updates from the community creator will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
