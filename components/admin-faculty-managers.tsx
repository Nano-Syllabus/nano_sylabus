"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { FacultyManagement, FacultyManager } from "@/lib/data/faculty-managers";
import type { AdminUserSummary } from "@/lib/types";

const inputClass =
  "min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/40";
const tagClass =
  "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";

/** Every faculty with the people who manage it; the search matches faculty, site and person. */
export function AdminFacultyManagers({
  faculties,
  showEmails,
  canEdit = false,
}: {
  faculties: FacultyManagement[];
  showEmails: boolean;
  /** Super admins change creators, subdomain admins and ambassadors here. */
  canEdit?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState<string | null>(null);
  const managed = faculties.find((faculty) => faculty.id === managing) ?? null;
  const [unmanagedOnly, setUnmanagedOnly] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faculties.filter((faculty) => {
      if (unmanagedOnly && faculty.managers.some((manager) => manager.role === "admin"))
        return false;
      if (!q) return true;
      return [
        faculty.name,
        faculty.slug,
        ...faculty.sites.map((site) => site.name),
        ...faculty.managers.flatMap((manager) => [manager.fullName, manager.email]),
      ].some((text) => text.toLowerCase().includes(q));
    });
  }, [faculties, query, unmanagedOnly]);

  const withoutAdmin = faculties.filter(
    (faculty) => !faculty.managers.some((manager) => manager.role === "admin"),
  ).length;

  return (
    <div className="mt-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Faculties" value={faculties.length} />
        <Stat
          label="Members"
          value={faculties.reduce((sum, faculty) => sum + faculty.members, 0)}
        />
        <Stat label="Without an admin" value={withoutAdmin} warn={withoutAdmin > 0} />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Search faculties or people</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={showEmails ? "Search faculty, subdomain, name or email" : "Search faculty, subdomain or name"}
            className={`${inputClass} pl-9`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={unmanagedOnly}
            onChange={(event) => setUnmanagedOnly(event.target.checked)}
            className="size-4 rounded border-border"
          />
          Only faculties without an admin
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Faculty</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Subdomains</th>
              <th className="px-4 py-3 font-medium">Managed by</th>
              <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Members</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.length ? (
              shown.map((faculty) => (
                <tr key={faculty.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/faculties/${encodeURIComponent(faculty.slug)}`}
                      className="font-medium text-blue-700 hover:underline dark:text-blue-300"
                    >
                      {faculty.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {faculty.slug}
                      {faculty.status !== "active" ? ` · ${faculty.status}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground sm:hidden">
                      {faculty.members} members
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {faculty.sites.length ? (
                      <div className="flex flex-wrap gap-1">
                        {faculty.sites.map((site) => (
                          <span key={site.slug} className={tagClass} title={site.slug}>
                            {site.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      {faculty.managers.length ? (
                        <ul className="min-w-0 space-y-2">
                          {faculty.managers.map((manager) => (
                            <ManagerRow key={`${manager.role}:${manager.userId}`} manager={manager} />
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-amber-700 dark:text-amber-300">
                          Only super admins
                        </span>
                      )}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => setManaging(faculty.id)}
                          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-600/10 dark:text-blue-300"
                        >
                          Manage
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                    {faculty.members}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {faculties.length ? "No faculty matches." : "No faculties to show."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {managed ? <ManageFacultyDialog faculty={managed} onClose={() => setManaging(null)} /> : null}
    </div>
  );
}

/** Search anyone who signed up, by name or email. */
function usePeopleSearch(query: string) {
  const [results, setResults] = useState<AdminUserSummary[] | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/admin/users?q=${encodeURIComponent(q)}&pageSize=6`, { signal: controller.signal })
        .then((response) => response.json())
        .then((payload) => setResults((payload.items ?? []) as AdminUserSummary[]))
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  return results;
}

async function send(url: string, method: string, body: unknown, fallback: string) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || fallback);
}

/**
 * Everything a super admin changes about who runs a faculty, in one place: the
 * creator (handed over directly), the admins of each subdomain listing it, and
 * whether each of them is an ambassador. Every change saves at once and the
 * page reloads its data.
 */
function ManageFacultyDialog({
  faculty,
  onClose,
}: {
  faculty: FacultyManagement;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [picking, setPicking] = useState<"creator" | "admin" | "ambassador" | null>(null);
  const [siteSlug, setSiteSlug] = useState(faculty.sites[0]?.slug ?? "");
  const [query, setQuery] = useState("");
  const results = usePeopleSearch(picking ? query : "");

  const creator = faculty.managers.find((manager) => manager.role === "creator") ?? null;
  const admins = faculty.managers.filter((manager) => manager.role === "admin");
  const ambassadors = faculty.managers.filter((manager) => manager.role === "ambassador");

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      setConfirm(null);
      setPicking(null);
      setQuery("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That change didn’t save.");
    } finally {
      setBusy(null);
    }
  }

  const toggleAmbassador = (manager: FacultyManager) =>
    run(`amb:${manager.userId}`, () =>
      send(
        "/api/admin/ambassadors",
        manager.ambassador ? "DELETE" : "POST",
        { email: manager.email },
        "The ambassador list didn’t change.",
      ),
    );

  const pick = (user: AdminUserSummary) =>
    picking === "ambassador"
      ? run("ambassador", () =>
          send(
            `/api/admin/faculties/${faculty.slug}/ambassadors`,
            "PUT",
            { userId: user.userId, action: "add" },
            "The ambassador wasn’t added.",
          ),
        )
      : picking === "creator"
      ? run("creator", () =>
          send(
            `/api/admin/faculties/${faculty.slug}/creator`,
            "PUT",
            { userId: user.userId },
            "The creator didn’t change.",
          ),
        )
      : run("admin", () =>
          send(
            `/api/admin/sites/${siteSlug}/admin`,
            "PUT",
            { userId: user.userId, action: "add" },
            "The admin wasn’t added.",
          ),
        );

  const blocked = (user: AdminUserSummary) =>
    picking === "ambassador"
      ? ambassadors.some((ambassador) => ambassador.userId === user.userId)
        ? "Already ambassador"
        : null
      : picking === "creator"
      ? user.userId === creator?.userId
        ? "Creator"
        : null
      : user.role === "super_admin"
        ? "Super admin"
        : admins.some((admin) => admin.userId === user.userId && admin.site?.slug === siteSlug)
          ? "Already admin"
          : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-faculty-title"
      onKeyDown={(event) => event.key === "Escape" && !busy && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="manage-faculty-title" className="font-display text-lg font-semibold">
              Who manages {faculty.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Changes save as you make them.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(busy)}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X size={16} />
          </button>
        </div>

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Creator
        </h3>
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {creator ? (
            <PersonRow manager={creator} busy={busy} onAmbassador={toggleAmbassador}>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => {
                  setPicking(picking === "creator" ? null : "creator");
                  setQuery("");
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-600/10 disabled:opacity-50 dark:text-blue-300"
              >
                Change
              </button>
            </PersonRow>
          ) : (
            <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-muted-foreground">
              No creator.
              <button
                type="button"
                onClick={() => setPicking("creator")}
                className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-600/10 dark:text-blue-300"
              >
                Set creator
              </button>
            </li>
          )}
        </ul>
        {picking === "creator" ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The new creator takes over at once — no email to accept. {creator?.fullName ?? "The old creator"}{" "}
            stays on as a member.
          </p>
        ) : null}

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Subdomain admins
        </h3>
        {faculty.sites.length ? (
          <>
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {admins.length ? (
                admins.map((admin) => {
                  const key = `rm:${admin.userId}`;
                  return (
                    <PersonRow
                      key={`${admin.site?.slug}:${admin.userId}`}
                      manager={admin}
                      busy={busy}
                      onAmbassador={toggleAmbassador}
                    >
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          confirm === key
                            ? void run(key, () =>
                                send(
                                  `/api/admin/sites/${admin.site!.slug}/admin`,
                                  "PUT",
                                  { userId: admin.userId, action: "remove" },
                                  "The admin wasn’t removed.",
                                ),
                              )
                            : setConfirm(key)
                        }
                        className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {confirm === key ? "Confirm remove" : "Remove"}
                      </button>
                    </PersonRow>
                  );
                })
              ) : (
                <li className="px-3 py-2.5 text-sm text-muted-foreground">No admin yet.</li>
              )}
            </ul>
            {confirm?.startsWith("rm:") ? (
              <p className="mt-2 text-xs leading-5 text-red-600">
                An admin runs the whole subdomain, not one faculty. Removing them makes them a
                student again.
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => {
                  setPicking(picking === "admin" ? null : "admin");
                  setQuery("");
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-600/10 disabled:opacity-50 dark:text-blue-300"
              >
                + Add admin
              </button>
              {picking === "admin" && faculty.sites.length > 1 ? (
                <select
                  value={siteSlug}
                  onChange={(event) => setSiteSlug(event.target.value)}
                  aria-label="Subdomain"
                  className="min-h-8 rounded-md border border-border bg-background px-2 text-xs"
                >
                  {faculty.sites.map((site) => (
                    <option key={site.slug} value={site.slug}>
                      {site.name}
                    </option>
                  ))}
                </select>
              ) : picking === "admin" ? (
                <span className="text-xs text-muted-foreground">to {faculty.sites[0].name}</span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No subdomain lists this faculty, so it has no admins. Add it to a site under Websites
            first.
          </p>
        )}

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Faculty ambassadors
        </h3>
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {ambassadors.length ? (
            ambassadors.map((ambassador) => {
              const key = `amb-rm:${ambassador.userId}`;
              return (
                <li key={ambassador.userId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{ambassador.fullName}</div>
                    <div className="truncate text-xs text-muted-foreground">{ambassador.email}</div>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      confirm === key
                        ? void run(key, () =>
                            send(
                              `/api/admin/faculties/${faculty.slug}/ambassadors`,
                              "PUT",
                              { userId: ambassador.userId, action: "remove" },
                              "The ambassador wasn’t removed.",
                            ),
                          )
                        : setConfirm(key)
                    }
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {confirm === key ? "Confirm remove" : "Remove"}
                  </button>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">No ambassador yet.</li>
          )}
        </ul>
        <div className="mt-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => {
              setPicking(picking === "ambassador" ? null : "ambassador");
              setQuery("");
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-600/10 disabled:opacity-50 dark:text-blue-300"
          >
            + Add ambassador
          </button>
          {picking === "ambassador" ? (
            <span className="ml-1 text-xs text-muted-foreground">
              They can also open the Student Ambassador workspace.
            </span>
          ) : null}
        </div>

        {picking ? (
          <div className="mt-4">
            <label className="relative block">
              <span className="sr-only">Search people</span>
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  picking === "creator"
                    ? "New creator — name or email"
                    : picking === "ambassador"
                      ? "New ambassador — name or email"
                      : "New admin — name or email"
                }
                className={`${inputClass} pl-9`}
              />
            </label>
            {results ? (
              <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {results.length ? (
                  results.map((user) => {
                    const reason = blocked(user);
                    return (
                      <li key={user.userId}>
                        <button
                          type="button"
                          disabled={Boolean(reason) || Boolean(busy)}
                          onClick={() => void pick(user)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {user.fullName || "No name"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {reason ??
                              (busy
                                ? "Saving…"
                                : picking === "creator"
                                  ? "Make creator"
                                  : picking === "ambassador"
                                    ? "Add ambassador"
                                    : "Make admin")}
                          </span>
                        </button>
                      </li>
                    );
                  })
                ) : (
                  <li className="px-3 py-3 text-sm text-muted-foreground">No one matches.</li>
                )}
              </ul>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(busy)}
            className="inline-flex min-h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** One person in the dialog: name, email, an Ambassador switch, and an action. */
function PersonRow({
  manager,
  busy,
  onAmbassador,
  children,
}: {
  manager: FacultyManager;
  busy: string | null;
  onAmbassador: (manager: FacultyManager) => void;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {manager.fullName}
          {manager.site ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              {manager.site.name}
            </span>
          ) : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">{manager.email}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={manager.ambassador}
            disabled={Boolean(busy) || !manager.email}
            onChange={() => onAmbassador(manager)}
            className="size-4 rounded border-border"
          />
          Ambassador
        </label>
        {children}
      </div>
    </li>
  );
}

function ManagerRow({ manager }: { manager: FacultyManager }) {
  return (
    <li className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate font-medium text-foreground">{manager.fullName}</span>
        <span
          className={
            manager.role === "admin"
              ? "rounded-full bg-blue-600/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300"
              : manager.role === "ambassador"
                ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                : tagClass
          }
        >
          {manager.role === "admin"
            ? `Admin · ${manager.site?.name}`
            : manager.role === "ambassador"
              ? "Faculty ambassador"
              : "Creator"}
        </span>
        {manager.ambassador && manager.role !== "ambassador" ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Ambassador
          </span>
        ) : null}
      </div>
      {manager.email ? (
        <div className="truncate text-xs text-muted-foreground">{manager.email}</div>
      ) : null}
    </li>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-2xl font-semibold tabular-nums ${
          warn ? "text-amber-700 dark:text-amber-300" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
