"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { USER_COLLECTION } from "@/lib/admin-resource-definitions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { AdminListPage, AdminUserDetail, AdminUserSummary, AppRole } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function AdminUserManager({
  initialUsers,
  initialPage,
}: {
  initialUsers: AdminUserSummary[];
  initialPage: AdminListPage<AdminUserSummary>;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [selectedId, setSelectedId] = useState<string>(initialUsers[0]?.userId ?? "");
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(initialPage.page);
  const [pageSize, setPageSize] = useState(initialPage.pageSize);
  const [total, setTotal] = useState(initialPage.total);
  const [totalPages, setTotalPages] = useState(initialPage.totalPages);
  const [listLoading, setListLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "loading" | "saving-role" | "adjusting-credits">("idle");
  const [nextRole, setNextRole] = useState<AppRole>("student");
  const [creditAmount, setCreditAmount] = useState("20");
  const [creditReason, setCreditReason] = useState("Manual admin adjustment");

  useEffect(() => {
    let ignore = false;

    async function loadDetail(userId: string) {
      if (!userId) {
        setDetail(null);
        return;
      }

      setBusy("loading");
      setFeedback(null);
      try {
        const response = await fetch(`/api/admin/users/${userId}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load user detail.");
        }
        if (ignore) return;
        setDetail(payload.user);
        setNextRole(payload.user.role);
      } catch (error) {
        if (!ignore) {
          setFeedback(error instanceof Error ? error.message : "Failed to load user detail.");
        }
      } finally {
        if (!ignore) setBusy("idle");
      }
    }

    void loadDetail(selectedId);

    return () => {
      ignore = true;
    };
  }, [selectedId]);

  const refreshUsers = useCallback(async (nextSelectedId?: string, requestedPage?: number) => {
    const targetPage = requestedPage ?? page;
    const params = new URLSearchParams();
    params.set("page", String(targetPage));
    params.set("pageSize", String(pageSize));
    if (query.trim()) {
      params.set("q", query.trim());
    }

    setListLoading(true);
    const response = await fetch(`/api/admin/users?${params.toString()}`);
    const payload = await response.json();
    setListLoading(false);
    if (!response.ok) {
      throw new Error(payload.error || "Failed to refresh users.");
    }

    setUsers(payload.items);
    setTotal(payload.total);
    setPage(payload.page);
    setPageSize(payload.pageSize);
    setTotalPages(payload.totalPages);
    setSelectedId((currentSelectedId) => {
      if (nextSelectedId) return nextSelectedId;
      return payload.items.some((user: AdminUserSummary) => user.userId === currentSelectedId)
        ? currentSelectedId
        : (payload.items[0]?.userId ?? "");
    });
  }, [page, pageSize, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshUsers(undefined, 1);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, refreshUsers]);

  async function handleRoleSave() {
    if (!detail) return;
    setBusy("saving-role");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/users/${detail.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update role.");
      }

      setDetail(payload.user);
      await refreshUsers(payload.user.userId, page);
      setFeedback(`Role updated to ${payload.user.role}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to update role.");
    } finally {
      setBusy("idle");
    }
  }

  async function handleCreditAdjustment() {
    if (!detail) return;
    const amount = Number(creditAmount);
    if (!Number.isInteger(amount) || amount === 0) {
      setFeedback("Use a whole number for the credit adjustment, and it cannot be zero.");
      return;
    }

    setBusy("adjusting-credits");
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/users/${detail.userId}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: creditReason,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to adjust credits.");
      }

      setDetail(payload.user);
      await refreshUsers(payload.user.userId, page);
      setFeedback(`Credits adjusted by ${amount > 0 ? "+" : ""}${amount}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to adjust credits.");
    } finally {
      setBusy("idle");
    }
  }

  const currentPageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const currentPageEnd = Math.min(total, page * pageSize);

  return (
    <div className="mx-auto grid max-w-[1600px] gap-6 px-5 py-6 md:px-8 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
          <div className="border-b border-border px-4 py-3">
            <p className="font-semibold">{USER_COLLECTION.label}</p>
            <p className="mt-1 text-xs text-text-secondary">{USER_COLLECTION.subtitle}</p>
          </div>
          <div className="border-b border-border px-4 py-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={USER_COLLECTION.searchPlaceholder}
            />
          </div>
          <div className="xl:max-h-[72vh] xl:overflow-y-auto">
            {users.length ? (
              users.map((user) => (
                <button
                  key={user.userId}
                  type="button"
                  onClick={() => setSelectedId(user.userId)}
                  className={`w-full border-b border-border px-4 py-3 text-left transition last:border-b-0 ${
                    selectedId === user.userId
                      ? "bg-[#f7f0b4] text-slate-950"
                      : "bg-bg-primary hover:bg-bg-secondary"
                  }`}
                >
                  <p className="text-sm font-medium">{user.fullName}</p>
                  <p className={`mt-1 text-xs ${selectedId === user.userId ? "text-slate-700" : "text-text-secondary"}`}>{user.email}</p>
                  <p className={`mt-1 text-[11px] ${selectedId === user.userId ? "text-slate-600" : "text-text-muted"}`}>
                    {user.role} · {user.creditBalance} credits · {user.grade || "Not onboarded"}
                  </p>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                {USER_COLLECTION.emptyMessage}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-text-secondary">
            <span>{listLoading ? "Loading..." : `Showing ${currentPageStart}-${currentPageEnd} of ${total}`}</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refreshUsers(undefined, Math.max(1, page - 1))}
                disabled={listLoading || page <= 1}
              >
                Prev
              </Button>
              <span>
                {page}/{Math.max(1, totalPages)}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refreshUsers(undefined, Math.min(totalPages, page + 1))}
                disabled={listLoading || page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <section className="space-y-6">
        <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <p className="font-display text-3xl">{detail?.fullName ?? "Select a user"}</p>
              <p className="mt-2 text-sm text-text-secondary">
                {detail?.email ?? "Choose a user from the left to inspect profile, role, and credit activity."}
              </p>
            </div>
            {detail ? (
              <div className="text-right text-sm text-text-secondary">
                <div>Joined {formatDate(detail.createdAt)}</div>
                <div>{detail.lastSignInAt ? `Last sign-in ${formatDate(detail.lastSignInAt)}` : "No sign-in yet"}</div>
              </div>
            ) : null}
          </div>

          {feedback ? (
            <div className="mx-5 mt-4 border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
              {feedback}
            </div>
          ) : null}

          {detail ? (
            <>
              <div className="grid gap-0 border-b border-border md:grid-cols-4">
                <MetricCard label="Credits" value={String(detail.creditBalance)} />
                <MetricCard label="Sessions" value={String(detail.chatSessionCount)} />
                <MetricCard label="Notes" value={String(detail.noteCount)} />
                <MetricCard label="Plan" value={detail.activePlanName ?? "Free"} />
              </div>

              <div className="grid gap-4 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
                <DetailBlock title="Academic profile">
                  <Row label="College" value={detail.college || "—"} />
                  <Row label="Board" value={detail.board || "—"} />
                  <Row label="Grade" value={detail.grade || "—"} />
                  <Row label="Score" value={detail.boardScore || "—"} />
                  <Row label="Target" value={detail.targetGrade || "—"} />
                  <Row label="Language" value={detail.languagePref} />
                  <Row label="Subjects" value={detail.subjects.length ? detail.subjects.join(", ") : "—"} />
                  <Row label="Onboarded" value={detail.onboarded ? "Yes" : "No"} />
                </DetailBlock>

                <DetailBlock title="Role control">
                  <Field label="Role">
                    <select
                      value={nextRole}
                      onChange={(event) => setNextRole(event.target.value as AppRole)}
                      className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
                    >
                      <option value="student">student</option>
                      <option value="admin">admin</option>
                    </select>
                  </Field>
                  <Button onClick={handleRoleSave} disabled={busy !== "idle"}>
                    {busy === "saving-role" ? "Saving..." : "Save role"}
                  </Button>
                </DetailBlock>

                <DetailBlock title="Credit adjustment">
                  <Field label="Amount">
                    <Input
                      value={creditAmount}
                      onChange={(event) => setCreditAmount(event.target.value)}
                      placeholder="20 or -10"
                    />
                  </Field>
                  <Field label="Reason">
                    <Input
                      value={creditReason}
                      onChange={(event) => setCreditReason(event.target.value)}
                    />
                  </Field>
                  <Button onClick={handleCreditAdjustment} disabled={busy !== "idle"}>
                    {busy === "adjusting-credits" ? "Applying..." : "Apply adjustment"}
                  </Button>
                </DetailBlock>
              </div>
            </>
          ) : null}
        </div>

        {detail ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <ListBlock
              title="Recent credit ledger"
              items={detail.recentLedger.map((entry) => ({
                title: `${entry.amount > 0 ? "+" : ""}${entry.amount} · balance ${entry.balanceAfter}`,
                meta: `${entry.type} · ${formatDate(entry.createdAt)}`,
                body: entry.description ?? "No description",
              }))}
              empty="No ledger entries yet."
            />
            <ListBlock
              title="Recent subscriptions"
              items={detail.recentSubscriptions.map((subscription) => ({
                title: subscription.status,
                meta: `Started ${formatDate(subscription.startsAt)}`,
                body: subscription.endsAt ? `Ends ${formatDate(subscription.endsAt)}` : "No end date",
              }))}
              empty="No subscriptions found."
            />
            <ListBlock
              title="Recent chat sessions"
              items={detail.recentSessions.map((session) => ({
                title: session.title,
                meta: `Updated ${formatDate(session.updatedAt)}`,
                body: session.id,
              }))}
              empty="No chat sessions yet."
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-b border-border bg-bg-secondary px-4 py-4 last:border-r-0">
      <p className="text-[11px] font-mono-ui uppercase text-text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-none border border-border bg-bg-primary p-4">
      <p className="font-medium">{title}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-mono-ui uppercase text-text-muted">{label}</p>
      <p className="mt-1 text-sm text-text-secondary">{value}</p>
    </div>
  );
}

function ListBlock({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ title: string; meta: string; body: string }>;
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
      <div className="border-b border-border px-4 py-3">
        <p className="font-semibold">{title}</p>
      </div>
      <div className="divide-y divide-border">
        {items.length ? (
          items.map((item, index) => (
            <div key={`${item.title}-${index}`} className="bg-bg-primary px-4 py-4">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-[11px] text-text-muted">{item.meta}</p>
              <p className="mt-2 text-sm text-text-secondary">{item.body}</p>
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">
            {empty}
          </div>
        )}
      </div>
    </div>
  );
}
