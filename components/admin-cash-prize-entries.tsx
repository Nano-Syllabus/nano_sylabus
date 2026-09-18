"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { AdminCashPrizeEntry } from "@/lib/data/cash-prize";

export function AdminCashPrizeEntries({
  entries,
  entryDate,
}: {
  entries: AdminCashPrizeEntry[];
  entryDate: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAllNames() {
    if (!entries.length) return;
    await navigator.clipboard.writeText(entries.map((entry) => entry.studentName).join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Daily qualified students</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entries.length} unique {entries.length === 1 ? "student" : "students"} · Nepal date {entryDate}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copyAllNames()}
          disabled={!entries.length}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Names copied" : "Copy all names"}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <TrophyEmpty />
          <h3 className="mt-4 font-display text-lg font-semibold">No qualified students</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Students appear automatically after their first passing challenge of this Nepal day.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-muted/60 text-[11px] tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="w-16 px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Qualified at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry, index) => (
                <tr key={entry.id} className="hover:bg-muted/35">
                  <td className="px-5 py-4 tabular-nums text-muted-foreground">{index + 1}</td>
                  <td className="px-5 py-4 font-medium">{entry.studentName}</td>
                  <td className="px-5 py-4 text-muted-foreground">{entry.studentEmail || "Unavailable"}</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {new Intl.DateTimeFormat("en-NP", {
                      timeZone: "Asia/Kathmandu",
                      hour: "numeric",
                      minute: "2-digit",
                      second: "2-digit",
                    }).format(new Date(entry.qualifiedAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TrophyEmpty() {
  return (
    <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted text-xl" aria-hidden="true">
      🏆
    </div>
  );
}
