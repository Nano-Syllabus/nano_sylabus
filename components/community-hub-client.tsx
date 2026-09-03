"use client";

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
  Sparkles,
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

type CommunitySection = "overview" | "subjects" | "forum" | "members";

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
  return `Join me on NanoSyllabus Pro. Use my referral link and, after your first paid Pro subscription is approved, we both get one free month: ${link}`;
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
    <article className="rounded-2xl border border-border bg-bg-primary p-5">
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-10 items-center justify-center rounded-xl bg-bg-secondary text-text-secondary">
          {icon}
        </span>
        <p className="font-display text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      </div>
      <h3 className="mt-5 text-sm font-semibold">{label}</h3>
      <p className="mt-1 text-xs leading-5 text-text-muted">{detail}</p>
    </article>
  );
}

export function CommunityHubClient({
  initialData,
  initialSection = "overview",
  memberRanking = "xp",
  initialInviteOpen = false,
}: {
  initialData: CommunityHubData;
  initialSection?: CommunitySection;
  memberRanking?: "xp" | "today";
  initialInviteOpen?: boolean;
}) {
  const router = useRouter();
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
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setActionError(payload.error || "Could not update your semester. Try again.");
        return;
      }
      setCurrentTermId(selectedTermId);
      router.refresh();
    } catch {
      setActionError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setTermSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1480px] px-4 pb-20 pt-3 sm:px-6 md:px-8 lg:px-10">
      {!initialData.canManage ? (
        <div className="mb-4 flex justify-end">
          <CommunityLeaveControl key={community.id} community={community} />
        </div>
      ) : null}
      <section className="relative isolate overflow-hidden rounded-2xl bg-[var(--community-banner)] px-5 py-5 text-white sm:px-7 sm:py-6 lg:px-8 lg:py-7">
        <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full border border-white/20" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-white/80">
              <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                {initialData.canManage ? "Community creator" : "Joined community"}
              </span>
              <span>{community.university}</span>
              <span aria-hidden="true">·</span>
              <span>{community.faculty}</span>
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-white/65">
              Your program community
            </p>
            <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {titleCase(community.name)}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-white/75">
              {community.description ||
                "Study your shared syllabus, practise its topics, and improve the community library together."}
            </p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/75">
              <span>
                <strong className="text-white">{community.totalYears}</strong> years
              </span>
              <span>
                <strong className="text-white">{community.totalSemesters}</strong> semesters
              </span>
              <span>
                <strong className="text-white">{initialData.subjects.length}</strong> subjects
              </span>
              <span>
                <strong className="text-white">{initialData.memberCount}</strong> members
              </span>
            </div>
          </div>

          <div className="border-t border-white/20 pt-5 lg:border-l lg:border-t-0 lg:py-1 lg:pl-7">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/65">
              Current semester
            </p>
            <p className="mt-2 text-lg font-semibold">
              Year {currentTerm.yearNumber} · Semester {currentTerm.semesterNumber}
            </p>
            <p className="mt-1 text-sm text-white/70">
              {currentSubjects.length} subject{currentSubjects.length === 1 ? "" : "s"} ·{" "}
              {currentSubjects.reduce((sum, subject) => sum + Number(subject.topicCount || 0), 0)}{" "}
              topics ready
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAnnouncementsOpen(true)}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15 focus-visible:ring-white ${focusRing}`}
              >
                <Bell className="size-4" aria-hidden="true" /> Announcements
              </button>
              <button
                type="button"
                onClick={openPeerInvite}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-[var(--community-banner)] hover:opacity-90 focus-visible:ring-white ${focusRing}`}
              >
                <UserRoundPlus className="size-4" aria-hidden="true" /> Invite peer
              </button>
            </div>
          </div>
        </div>
      </section>

      <nav
        className="mt-7 flex gap-6 overflow-x-auto border-b border-border"
        aria-label="Community sections"
      >
        {(["overview", "subjects", "forum", "members"] as const).map((item) => (
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
        <CommunityOverview
          data={initialData}
          voteCounts={voteCounts}
          onOpenForum={() => setSection("forum")}
          onOpenReferral={openPeerInvite}
        />
      ) : null}
      {section === "subjects" ? (
        <CommunitySubjects
          data={initialData}
          groupedYears={groupedYears}
          selectedTermId={selectedTermId}
          currentTermId={currentTermId}
          selectedSubjects={selectedSubjects}
          termSaving={termSaving}
          onSelectTerm={setSelectedTermId}
          onSaveCurrentTerm={saveCurrentTerm}
        />
      ) : null}
      {section === "forum" ? (
        <CommunityForum
          data={initialData}
          posts={initialData.posts}
          voteCounts={voteCounts}
          votedPosts={votedPosts}
          votingPostId={votingPostId}
          onVote={vote}
        />
      ) : null}
      {section === "members" ? (
        <CommunityMembers data={initialData} ranking={memberRanking} />
      ) : null}

      <section
        className="mt-12 grid gap-4 border-t border-border pt-8 md:grid-cols-2"
        aria-label="Community membership actions"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Active membership
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold">{titleCase(community.name)}</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Joined as {initialData.canManage ? "community creator" : "member"} ·{" "}
            {formatNumber(initialData.memberCount)} active members
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-start gap-2 md:justify-end">
          {initialData.canManage ? (
            <Link
              href={`/teachers?view=communities&community=${encodeURIComponent(community.slug)}`}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-semibold hover:bg-bg-secondary ${focusRing}`}
            >
              <ShieldCheck className="size-4" aria-hidden="true" /> Manage community
            </Link>
          ) : (
            <CommunityLeaveControl key={community.id} community={community} />
          )}
        </div>
      </section>

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
              Refer a friend to <strong className="text-text-primary">NanoSyllabus Pro</strong> and
              you both earn <strong className="text-success">1 free month</strong> after their first
              paid Pro subscription is approved.
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
                <li>Share your unique referral link below.</li>
                <li>Your friend creates an account and subscribes to NanoSyllabus Pro.</li>
                <li>After payment approval, both accounts get 30 days automatically.</li>
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
  voteCounts,
  onOpenForum,
  onOpenReferral,
}: {
  data: CommunityHubData;
  voteCounts: Record<string, number>;
  onOpenForum: () => void;
  onOpenReferral: () => void;
}) {
  return (
    <div className="pt-8">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Community metrics">
        <MetricCard
          icon={<Users className="size-5" aria-hidden="true" />}
          label="Total members"
          value={formatNumber(data.memberCount)}
          detail="Active community memberships"
        />
        <MetricCard
          icon={<Check className="size-5" aria-hidden="true" />}
          label="Active today"
          value={formatNumber(data.activeToday)}
          detail={`Members with recorded practice today, out of ${formatNumber(data.memberCount)}`}
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
        <MetricCard
          icon={<Trophy className="size-5" aria-hidden="true" />}
          label="Your rank"
          value={data.viewer.rank ? `#${data.viewer.rank}` : "—"}
          detail="Community-scoped challenge and contribution XP"
        />
      </section>

      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <section aria-labelledby="community-pulse-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Community pulse
              </p>
              <h2 id="community-pulse-heading" className="mt-2 font-display text-2xl font-semibold">
                Recent verified activity
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenForum}
              className={`min-h-10 text-sm font-medium text-text-secondary hover:text-text-primary ${focusRing}`}
            >
              Open forum
            </button>
          </div>
          {data.activity.length ? (
            <div className="mt-4 divide-y divide-border border-y border-border">
              {data.activity.map((item) => (
                <article
                  key={item.id}
                  className="grid gap-2 py-4 sm:grid-cols-[100px_minmax(0,1fr)_100px] sm:items-start"
                >
                  <time dateTime={item.occurredAt} className="text-xs text-text-muted">
                    {relativeTime(item.occurredAt)}
                  </time>
                  <div>
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm leading-5 text-text-secondary">{item.detail}</p>
                  </div>
                  <span className="text-sm font-medium tabular-nums sm:text-right">
                    {item.value}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center">
              <Sparkles className="mx-auto size-7 text-text-muted" aria-hidden="true" />
              <h3 className="mt-3 font-semibold">No community activity yet</h3>
              <p className="mt-1 text-sm text-text-secondary">
                Completed challenges, posts, and announcements will appear here.
              </p>
            </div>
          )}

          <section
            className="mt-6 grid gap-3 sm:grid-cols-2"
            aria-label="Community invitations and study room"
          >
            <article className="flex min-h-52 flex-col rounded-2xl border border-border bg-bg-secondary p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-bg-primary text-[var(--community-accent)] shadow-sm">
                <UserRoundPlus className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-text-muted">
                Peer referral
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold">
                Give 1 month. Get 1 month.
              </h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                After your friend&apos;s first paid Pro subscription is approved, both accounts get
                30 days automatically.
              </p>
              <button
                type="button"
                onClick={onOpenReferral}
                className={`mt-auto inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-text-primary px-4 text-sm font-semibold text-text-inverse hover:opacity-90 ${focusRing}`}
              >
                Create referral link <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </article>

            <article className="flex min-h-52 flex-col rounded-2xl border border-border bg-bg-primary p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-bg-secondary text-[var(--community-accent)]">
                <MessageCircle className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-text-muted">
                Discord co-study server
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold">Discord Study Room</h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Join the NanoSyllabus Discord room for voice study, questions, and peer help.
              </p>
              <a
                href={DISCORD_STUDY_ROOM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-auto inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-border px-4 text-sm font-semibold hover:bg-bg-secondary ${focusRing}`}
              >
                Join Discord <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </article>
          </section>
        </section>

        <aside className="space-y-8">
          <section
            className="border-l-2 border-[var(--community-accent)] pl-5"
            aria-labelledby="rhythm-heading"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              This week
            </p>
            <h2 id="rhythm-heading" className="mt-2 font-display text-xl font-semibold">
              Your community rhythm
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-5">
              <SmallMetric
                value={formatNumber(data.viewer.completedThisWeek)}
                label="Challenges passed"
              />
              <SmallMetric value={`+${formatNumber(data.viewer.weeklyXp)}`} label="XP earned" />
              <SmallMetric value={formatNumber(data.viewer.streak)} label="Day streak" />
              <SmallMetric
                value={data.viewer.bestScore === null ? "—" : `${data.viewer.bestScore}%`}
                label="Best challenge"
              />
            </div>
            <Link
              href="/app/challenges"
              className={`mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-text-primary px-4 text-sm font-semibold text-text-inverse hover:opacity-90 ${focusRing}`}
            >
              Start a challenge <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </section>

          <section
            className="border-t border-border pt-6"
            aria-labelledby="top-contributors-heading"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="top-contributors-heading" className="font-display text-lg font-semibold">
                Top members
              </h2>
              <span className="text-xs text-text-muted">All time</span>
            </div>
            {data.members.length ? (
              <ol className="mt-4 space-y-4">
                {data.members.slice(0, 5).map((member) => (
                  <li key={member.id} className="flex items-center gap-3">
                    <span className="w-5 text-xs tabular-nums text-text-muted">#{member.rank}</span>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-xs font-semibold">
                      {member.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {member.name}
                        {member.isViewer ? " (you)" : ""}
                      </span>
                      <span className="block text-xs text-text-muted">
                        {member.completedChallenges} challenges
                      </span>
                    </span>
                    <span className="text-xs font-medium tabular-nums text-text-secondary">
                      {formatNumber(member.xp)} XP
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>

          {data.posts[0] ? (
            <section className="border-t border-border pt-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Latest contribution
              </p>
              <h2 className="mt-2 font-display text-lg font-semibold">{data.posts[0].title}</h2>
              <p className="mt-2 text-sm text-text-secondary">
                {voteCounts[data.posts[0].id] || 0} / {data.community.contributionThreshold}{" "}
                community votes
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
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
                  href={`/app/communities/${encodeURIComponent(data.community.slug)}/subjects/${encodeURIComponent(subject.slug)}`}
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

function CommunityMembers({ data, ranking }: { data: CommunityHubData; ranking: "xp" | "today" }) {
  const members =
    ranking === "today"
      ? [...data.members].sort(
          (left, right) =>
            right.todayAttempts - left.todayAttempts ||
            right.streak - left.streak ||
            right.xp - left.xp ||
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
            ? "Ranked by today's real challenge activity, then streak and community XP."
            : "Ranked by XP earned from this community's challenges and accepted contributions."}
        </p>
      </div>
      {members.length ? (
        <div className="mt-6 border-y border-border">
          <div className="hidden grid-cols-[56px_44px_minmax(0,1fr)_120px_100px] gap-3 border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted sm:grid">
            <span>Rank</span>
            <span aria-hidden="true" />
            <span>Member</span>
            <span>{ranking === "today" ? "Today" : "Completed"}</span>
            <span className="text-right">{ranking === "today" ? "Streak" : "XP"}</span>
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
                      ? `${formatNumber(member.xp)} XP`
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
                      {formatNumber(member.xp)} XP
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

function SmallMetric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{label}</p>
    </div>
  );
}
