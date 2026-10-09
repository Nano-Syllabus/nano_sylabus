"use client";

import { FacultyTags, SiteTag, SubdomainPicker } from "@/components/admin-faculty-tags";
import { AdminGiftPlan } from "@/components/admin-gift-plan";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import type { AdminListPage, AdminUserDetail, AdminUserSummary, AppRole } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { MONTHLY_FREE_CREDITS } from "@/lib/billing";
import { messageOf, toast } from "@/components/admin/admin-toaster";

type RoleFilter = "all" | "students" | "admins" | "ambassadors";

const roleLabel: Record<AppRole, string> = {
  student: "Student",
  admin: "Admin",
  super_admin: "Super admin",
};

const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/40";
/** The same field sized by its row (flex), not stretched to the full width. */
const inlineInputClass = inputClass.replace("w-full ", "");

export function AdminUserManager({
  initialPage,
  viewerRole,
  viewerUserId,
  ambassadorEmails = null,
  faculties = [],
  initialFaculty = "",
}: {
  initialUsers?: AdminUserSummary[];
  initialPage: AdminListPage<AdminUserSummary>;
  viewerRole: Extract<AppRole, "admin" | "super_admin">;
  viewerUserId: string;
  /** Who may create faculties; null when the viewer isn't a super admin. */
  ambassadorEmails?: string[] | null;
  /** Every active faculty, for the "who is in / who runs this faculty" filter. */
  faculties?: Array<{ slug: string; name: string }>;
  /** A faculty the server already filtered page 1 by (`?faculty=` from the Faculties page). */
  initialFaculty?: string;
}) {
  const [list, setList] = useState(initialPage);
  const [faculty, setFaculty] = useState(initialFaculty);
  const [ambassadors, setAmbassadors] = useState(
    () => ambassadorEmails && new Set(ambassadorEmails.map((email) => email.toLowerCase())),
  );
  const isAmbassador = (email: string | null | undefined) =>
    Boolean(email && ambassadors?.has(email.toLowerCase()));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const firstRun = useRef(true);
  const pending = useRef<AbortController | null>(null);

  const load = useCallback(
    async (page: number) => {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      const params = new URLSearchParams({ page: String(page), pageSize: String(list.pageSize) });
      if (query.trim()) params.set("q", query.trim());
      if (filter !== "all") params.set("role", filter);
      if (faculty) params.set("faculty", faculty);
      setLoading(true);
      setListError(null);
      try {
        const response = await fetch(`/api/admin/users?${params}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Users could not be loaded.");
        setList(payload);
      } catch (error) {
        if (!controller.signal.aborted)
          setListError(error instanceof Error ? error.message : "Users could not be loaded.");
      } finally {
        if (pending.current === controller) setLoading(false);
      }
    },
    [faculty, filter, list.pageSize, query],
  );

  useEffect(() => {
    // The server already rendered page 1 with no search; only refetch once the admin changes something.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => void load(1), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter, faculty]);

  const patchRow = (user: AdminUserSummary) =>
    setList((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.userId === user.userId ? { ...item, ...user } : item,
      ),
    }));

  // With a faculty chosen the server puts its admins first, so page one holds them.
  const facultyName = faculties.find((item) => item.slug === faculty)?.name ?? faculty;
  const facultyAdmins = faculty ? list.items.filter((user) => user.role === "admin") : [];

  const from = list.total ? (list.page - 1) * list.pageSize + 1 : 0;
  const to = Math.min(list.total, from + list.items.length - 1);

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Everyone who signed up — students and admins. Pick a faculty to see who is in it and which admin runs it. Click a person to see their plan, give them credits or change their access."
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email or college"
            className={`${inputClass} pl-9`}
          />
        </label>
        {faculties.length ? (
          <label className="sm:w-56">
            <span className="sr-only">Faculty</span>
            <select
              value={faculty}
              onChange={(event) => setFaculty(event.target.value)}
              className={inputClass}
            >
              <option value="">All faculties</option>
              {faculties.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Show">
          {(
            [
              ["all", "Everyone"],
              ["students", "Students"],
              ["admins", "Admins"],
              ["ambassadors", "Ambassadors"],
            ] as const
          )
            // Only a super admin holds the ambassador list.
            .filter(([value]) => value !== "ambassadors" || ambassadors)
            .map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-9 flex-1 rounded-md px-3 text-sm font-medium sm:flex-none ${
                  filter === value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
        </div>
      </div>

      {faculty && !loading && list.page === 1 ? (
        <p className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span className="font-medium">{facultyName}</span>{" "}
          {facultyAdmins.length ? (
            <>
              is run by{" "}
              {facultyAdmins.map((admin, index) => (
                <span key={admin.userId}>
                  {index ? ", " : ""}
                  <button
                    type="button"
                    onClick={() => setOpenId(admin.userId)}
                    className="font-medium text-blue-700 hover:underline dark:text-blue-300"
                  >
                    {admin.fullName || admin.email}
                  </button>
                  <span className="text-muted-foreground">
                    {" "}
                    ({admin.email}
                    {admin.site ? ` · ${admin.site.name}` : ""})
                  </span>
                </span>
              ))}
              .
            </>
          ) : (
            <span className="text-muted-foreground">
              has no admin — only super admins manage it. Set one under Websites.
            </span>
          )}
        </p>
      ) : null}

      <section
        className="mt-4 overflow-clip rounded-xl border border-border bg-card"
        aria-busy={loading}
      >
        {listError ? (
          <p role="alert" className="px-5 py-10 text-center text-sm text-destructive">
            {listError}
          </p>
        ) : list.items.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted-foreground">
            {loading ? "Searching…" : "No one matches that search."}
          </p>
        ) : (
          <table className={`w-full text-left text-sm ${loading ? "opacity-60" : ""}`}>
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/60 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Subdomain</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Faculty</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Plan</th>
                <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Credits</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Joined</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.items.map((user) => (
                <tr
                  key={user.userId}
                  onClick={() => setOpenId(user.userId)}
                  className={`cursor-pointer hover:bg-muted/50 ${openId === user.userId ? "bg-muted/60" : ""}`}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenId(user.userId);
                      }}
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      <Avatar name={user.fullName} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="truncate">{user.fullName || "No name"}</span>
                          {user.role !== "student" ? <RoleBadge role={user.role} /> : null}
                          {isAmbassador(user.email) ? <AmbassadorBadge /> : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {user.email}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <SiteTag user={user} />
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <FacultyTags faculties={user.faculties} />
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <PlanBadge plan={user.activePlanName} />
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums sm:table-cell">
                    {creditsLabel(user)}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground lg:table-cell">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell">
                    {timeAgo(user.lastSignInAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-sm text-muted-foreground">
          <span>{list.total ? `${from}–${to} of ${list.total}` : "0 people"}</span>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Previous page"
              disabled={list.page <= 1 || loading}
              onClick={() => void load(list.page - 1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={list.page >= list.totalPages || loading}
              onClick={() => void load(list.page + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>

      {openId ? (
        <StudentPanel
          key={openId}
          userId={openId}
          summary={list.items.find((user) => user.userId === openId) ?? null}
          canManageRoles={viewerRole === "super_admin"}
          ambassador={
            ambassadors
              ? isAmbassador(list.items.find((user) => user.userId === openId)?.email)
              : null
          }
          onAmbassadorsChanged={(emails) =>
            setAmbassadors(new Set(emails.map((email) => email.toLowerCase())))
          }
          isSelf={openId === viewerUserId}
          onClose={() => setOpenId(null)}
          onChanged={patchRow}
        />
      ) : null}
    </>
  );
}

function StudentPanel({
  userId,
  summary,
  canManageRoles,
  ambassador,
  onAmbassadorsChanged,
  isSelf,
  onClose,
  onChanged,
}: {
  userId: string;
  summary: AdminUserSummary | null;
  canManageRoles: boolean;
  /** Whether this person may create faculties; null hides the control (not a super admin). */
  ambassador: boolean | null;
  onAmbassadorsChanged: (emails: string[]) => void;
  isSelf: boolean;
  onClose: () => void;
  onChanged: (user: AdminUserSummary) => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"credits" | "role" | "ambassador" | null>(null);
  const [amount, setAmount] = useState("20");
  const [reason, setReason] = useState("");
  const [role, setRole] = useState<AppRole>(summary?.role ?? "student");
  const [siteSlug, setSiteSlug] = useState(summary?.site?.slug ?? "");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/users/${userId}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "This person could not be loaded.");
        setDetail(payload.user);
        setRole(payload.user.role);
        setSiteSlug(payload.user.site?.slug ?? "");
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "This person could not be loaded.");
      });
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const person = detail ?? summary;
  const credits = Number(amount);
  const creditsValid = Number.isInteger(credits) && credits !== 0;

  async function saveCredits() {
    if (!creditsValid) return;
    setBusy("credits");
    try {
      const response = await fetch(`/api/admin/users/${userId}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: credits,
          description: reason.trim() || "Manual admin adjustment",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Credits could not be changed.");
      setDetail(payload.user);
      onChanged(payload.user);
      setReason("");
      toast.success(
        `${credits > 0 ? "Gave" : "Took"} ${Math.abs(credits)} credits ${credits > 0 ? "to" : "from"} ${payload.user.fullName || payload.user.email}`,
        { description: `New balance: ${payload.user.creditBalance}.` },
      );
    } catch (cause) {
      toast.error("Credits could not be changed", { description: messageOf(cause, "Try again.") });
    } finally {
      setBusy(null);
    }
  }

  async function saveRole() {
    setBusy("role");
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(role === "admin" ? { role, siteSlug } : { role }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Access could not be changed.");
      setDetail(payload.user);
      onChanged(payload.user);
      toast.success(
        `${payload.user.fullName || payload.user.email} is now ${
          payload.user.site
            ? `${roleLabel[payload.user.role as AppRole].toLowerCase()} of ${payload.user.site.name}`
            : `a ${roleLabel[payload.user.role as AppRole].toLowerCase()}`
        }`,
      );
    } catch (cause) {
      toast.error("Access could not be changed", { description: messageOf(cause, "Try again.") });
    } finally {
      setBusy(null);
    }
  }

  async function toggleAmbassador() {
    const email = person?.email;
    if (!email || ambassador === null) return;
    setBusy("ambassador");
    try {
      const response = await fetch("/api/admin/ambassadors", {
        method: ambassador ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Ambassador access could not be changed.");
      onAmbassadorsChanged(
        (payload.ambassadors as Array<{ email: string }>).map((row) => row.email),
      );
      toast.success(
        ambassador
          ? `${person?.fullName || email} is no longer a student ambassador`
          : `${person?.fullName || email} is now a student ambassador`,
      );
    } catch (cause) {
      toast.error("Ambassador access could not be changed", {
        description: messageOf(cause, "Try again."),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={person?.fullName || "Student"}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-background shadow-xl"
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <Avatar name={person?.fullName ?? ""} large />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{person?.fullName || "No name"}</h2>
            <p className="truncate text-sm text-muted-foreground">{person?.email}</p>
            {person ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {roleLabel[person.role]} · joined {formatDate(person.createdAt)} · last seen{" "}
                {timeAgo(person.lastSignInAt)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-muted/40 p-4">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {person ? (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              <dl className="grid grid-cols-4 divide-x divide-border text-center">
                <Stat label="Plan" value={person.activePlanName ?? "Free"} />
                <Stat label="Credits" value={creditsLabel(person)} />
                <Stat label="Chats" value={String(person.chatSessionCount)} />
                <Stat label="Notes" value={String(person.noteCount)} />
              </dl>
              {/* Which faculties this person is allowed into — shown to every
                  viewer, not only in the read-only Access view. */}
              <div className="flex items-start gap-3 px-3 py-2.5">
                <span className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">
                  {person.role === "student" ? "Faculty" : "Faculties"}
                </span>
                <FacultyTags faculties={person.faculties} wrap />
              </div>
              {person.role === "admin" ? (
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <span className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">
                    Subdomain
                  </span>
                  <SiteTag user={person} />
                </div>
              ) : null}
              {person.activePlanEndsAt ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {person.activePlanName} until {formatDate(person.activePlanEndsAt)}
                </p>
              ) : null}
            </div>
          ) : null}

          <Section title="Credits" hint={person ? `Balance ${creditsLabel(person)}` : undefined}>
            <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Quick amounts">
              {[-10, 10, 20, 50, 100].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={amount === String(value)}
                  onClick={() => setAmount(String(value))}
                  className={`min-h-9 rounded-lg border text-sm font-medium tabular-nums ${
                    amount === String(value)
                      ? "border-blue-600 bg-blue-600/10 text-blue-700 dark:text-blue-300"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {value > 0 ? `+${value}` : value}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                inputMode="numeric"
                aria-label="Credits"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={`${inlineInputClass} w-20 shrink-0 tabular-nums`}
              />
              <input
                aria-label="Reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason (optional)"
                className={`${inlineInputClass} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => void saveCredits()}
                disabled={!creditsValid || busy !== null || !detail}
                className={`${primaryButton} shrink-0 tabular-nums`}
              >
                {busy === "credits"
                  ? "Saving…"
                  : !creditsValid
                    ? "Apply"
                    : credits > 0
                      ? `Give ${credits}`
                      : `Take ${Math.abs(credits)}`}
              </button>
            </div>
          </Section>

          {canManageRoles && person?.role === "student" ? (
            <Section title="Gift a plan" hint="Plus or Pro, for one faculty">
              <AdminGiftPlan
                userId={userId}
                onGifted={() => {
                  fetch(`/api/admin/users/${userId}`)
                    .then((response) => response.json())
                    .then((payload) => {
                      if (payload.user) {
                        setDetail(payload.user);
                        onChanged(payload.user);
                      }
                    })
                    .catch(() => undefined);
                }}
              />
            </Section>
          ) : null}

          <Section title="Access" hint={person ? roleLabel[person.role] : undefined}>
            {canManageRoles ? (
              <>
                <div
                  className="flex gap-1 rounded-lg bg-muted p-1"
                  role="group"
                  aria-label="Access"
                >
                  {(["student", "admin", "super_admin"] as AppRole[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={isSelf}
                      aria-pressed={role === value}
                      onClick={() => setRole(value)}
                      className={`min-h-9 flex-1 rounded-md px-2 text-sm font-medium disabled:cursor-not-allowed ${
                        role === value
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {roleLabel[value]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {isSelf
                    ? "You can’t change your own access."
                    : "An admin runs one subdomain and its faculties. Super admins see every faculty and can change other people’s access."}
                </p>
                {role === "admin" ? (
                  <SubdomainPicker
                    userId={userId}
                    value={siteSlug}
                    onChange={setSiteSlug}
                    disabled={isSelf || busy !== null}
                    faculties={
                      detail?.role === "admin" &&
                      detail.site?.slug === siteSlug &&
                      detail.faculties !== "all"
                        ? detail.faculties
                        : null
                    }
                  />
                ) : null}
                {detail &&
                (role !== detail.role ||
                  (role === "admin" && siteSlug !== (detail.site?.slug ?? ""))) ? (
                  <button
                    type="button"
                    onClick={() => void saveRole()}
                    disabled={busy !== null || (role === "admin" && !siteSlug)}
                    className={`${primaryButton} mt-3 w-full`}
                  >
                    {busy === "role"
                      ? "Saving…"
                      : role === "admin" && !siteSlug
                        ? "Choose a subdomain"
                        : role === detail.role
                          ? "Change subdomain"
                          : `Make ${roleLabel[role]}`}
                  </button>
                ) : null}
                {ambassador !== null && person?.email ? (
                  <div className="-mx-4 mt-4 flex items-center justify-between gap-4 border-t border-border px-4 pt-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Student ambassador</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        Can create faculties.
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={ambassador}
                      aria-label="Student ambassador"
                      disabled={busy !== null}
                      onClick={() => void toggleAmbassador()}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                        ambassador ? "bg-blue-600" : "bg-muted-foreground/35"
                      }`}
                    >
                      <span
                        className={`inline-block size-5 rounded-full bg-white shadow-sm transition-[translate] ${
                          ambassador ? "translate-x-[22px]" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {person ? roleLabel[person.role] : "—"}. Only a super admin can change access.
                </p>
              </>
            )}
          </Section>

          {detail ? (
            <>
              <Section title="Profile">
                <dl className="-mx-4 -my-1 divide-y divide-border text-sm">
                  <Detail label="College" value={detail.college} />
                  <Detail label="Board" value={detail.board} />
                  <Detail label="Class" value={detail.grade} />
                  <Detail label="Subjects" value={detail.subjects.join(", ")} />
                  <Detail label="Language" value={detail.languagePref} />
                  <Detail label="Finished setup" value={detail.onboarded ? "Yes" : "No"} />
                </dl>
              </Section>

              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                <History title="Credit history" empty="No credit changes yet.">
                  {detail.recentLedger.map((entry) => (
                    <HistoryRow
                      key={entry.id}
                      left={entry.description || entry.type}
                      sub={formatDate(entry.createdAt)}
                      right={`${entry.amount > 0 ? "+" : ""}${entry.amount}`}
                    />
                  ))}
                </History>
                <History title="Plans" empty="Never had a paid plan.">
                  {detail.recentSubscriptions.map((subscription) => (
                    <HistoryRow
                      key={subscription.id}
                      left={subscriptionState(subscription)}
                      sub={`${formatDate(subscription.startsAt)}${subscription.endsAt ? ` – ${formatDate(subscription.endsAt)}` : ""}`}
                    />
                  ))}
                </History>
                <History title="Recent chats" empty="No chats yet.">
                  {detail.recentSessions.map((session) => (
                    <HistoryRow
                      key={session.id}
                      left={session.title}
                      sub={formatDate(session.updatedAt)}
                    />
                  ))}
                </History>
              </div>
            </>
          ) : !error ? (
            <div className="space-y-3 motion-safe:animate-pulse" aria-label="Loading">
              <div className="h-4 w-24 rounded bg-border" />
              <div className="h-40 rounded-lg bg-border/60" />
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/** One card per job, its current state on the right of the title, so the panel
 * reads as a few separate tools instead of one long column of controls. */
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function History({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold">
        {title}
        <span className="text-xs font-normal text-muted-foreground">
          {children.length ? `${children.length} recent` : "None"}
          <ChevronRight
            size={14}
            className="ml-1 inline transition-transform group-open:rotate-90"
          />
        </span>
      </summary>
      <div className="divide-y divide-border border-t border-border">
        {children.length ? (
          children
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
    </details>
  );
}

function HistoryRow({ left, sub, right }: { left: string; sub: string; right?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm first-letter:uppercase">{left}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      {right ? <span className="text-sm font-medium tabular-nums">{right}</span> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value || "—"}</dd>
    </div>
  );
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ${
        large ? "h-11 w-11 text-sm" : "h-8 w-8 text-xs"
      }`}
    >
      {initials}
    </span>
  );
}

function RoleBadge({ role }: { role: AppRole }) {
  return (
    <span className="shrink-0 rounded-full bg-blue-600/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">
      {roleLabel[role]}
    </span>
  );
}

function AmbassadorBadge() {
  return (
    <span className="shrink-0 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
      Ambassador
    </span>
  );
}

function PlanBadge({ plan }: { plan: string | null }) {
  return plan ? (
    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
      {plan}
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">Free</span>
  );
}

/** "Unlimited" for admins and unlimited plans, "12 / 20" for the monthly refill, the plain balance for ambassadors. */
function creditsLabel(user: Pick<AdminUserSummary, "creditAllowance" | "creditBalance">) {
  if (user.creditAllowance === "unlimited") return "Unlimited";
  if (user.creditAllowance === "monthly") return `${user.creditBalance} / ${MONTHLY_FREE_CREDITS}`;
  return String(user.creditBalance);
}

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return formatDate(iso);
}

/** A row can stay "active" after its end date; say what it really is. */
function subscriptionState(subscription: AdminUserDetail["recentSubscriptions"][number]) {
  if (
    subscription.status === "active" &&
    subscription.endsAt &&
    new Date(subscription.endsAt).getTime() <= Date.now()
  )
    return "ended";
  return subscription.status;
}
