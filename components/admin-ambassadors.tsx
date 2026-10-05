"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { AmbassadorRow } from "@/lib/data/student-ambassadors";
import { formatDate } from "@/lib/utils";

async function request(method: "POST" | "DELETE", email: string) {
  const response = await fetch("/api/admin/ambassadors", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please retry.");
  return payload.ambassadors as AmbassadorRow[];
}

/**
 * Super admin: who may create faculties. Any email can be added, even before the
 * person has signed up; the permission applies as soon as they sign in with it.
 */
export function AdminAmbassadors({ initial }: { initial: AmbassadorRow[] }) {
  const [rows, setRows] = useState(initial);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run(method: "POST" | "DELETE", address: string) {
    setBusy(address);
    setError("");
    try {
      setRows(await request(method, address));
      if (method === "POST") setEmail("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section
      className="mb-6 rounded-xl border border-border bg-card p-5"
      aria-labelledby="ambassadors-title"
    >
      <h2 id="ambassadors-title" className="font-semibold">
        Student ambassadors
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Only these emails can create faculties. Add any email, even before they sign up.
      </p>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (email.trim()) void run("POST", email.trim());
        }}
      >
        <input
          type="email"
          required
          aria-label="Ambassador email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          className="min-h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
        />
        <button
          type="submit"
          disabled={Boolean(busy) || !email.trim()}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy === email.trim() ? "Adding…" : "Make ambassador"}
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
        {rows.map((row) => (
          <li key={row.email} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{row.email}</span>
              <span className="block text-xs text-muted-foreground">
                {row.hasAccount ? "Has an account" : "Not signed up yet"} · added{" "}
                {formatDate(row.addedAt)}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Remove ${row.email} as ambassador`}
              disabled={Boolean(busy)}
              onClick={() => void run("DELETE", row.email)}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {!rows.length ? (
          <li className="px-3 py-4 text-sm text-muted-foreground">No ambassadors yet.</li>
        ) : null}
      </ul>
    </section>
  );
}
