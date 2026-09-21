"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { AdminWeeklyEntry } from "@/lib/data/cash-prize-weekly";

/**
 * The names to paste into the wheel: each student once per entry, so a student
 * with two entries is twice as likely to be drawn — the weighting the campaign
 * promises ("every 5 verified referrals repeats your name once more").
 */
export function wheelNames(entries: AdminWeeklyEntry[]) {
  return entries.flatMap((entry) => Array.from({ length: Math.max(1, entry.entries) }, () => entry.studentName));
}

export function AdminCashPrizeEntries({
  entries,
  drawDate,
}: {
  entries: AdminWeeklyEntry[];
  drawDate: string;
}) {
  const [copied, setCopied] = useState(false);
  const names = wheelNames(entries);

  async function copyWheelNames() {
    if (!names.length) return;
    await navigator.clipboard.writeText(names.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Confirmed participants</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entries.length} {entries.length === 1 ? "student" : "students"} · {names.length} wheel{" "}
            {names.length === 1 ? "entry" : "entries"} · Friday draw {drawDate}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copyWheelNames()}
          disabled={!names.length}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Names copied" : "Copy wheel names"}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <TrophyEmpty />
          <h3 className="mt-4 font-display text-lg font-semibold">No participants yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Students appear here when they confirm participation with a 7-day streak.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="bg-muted/60 text-[11px] tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="w-16 px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Streak</th>
                <th className="px-5 py-3 font-medium">Verified referrals</th>
                <th className="px-5 py-3 font-medium">Entries</th>
                <th className="px-5 py-3 font-medium">Confirmed at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry, index) => (
                <tr key={entry.id} className="hover:bg-muted/35">
                  <td className="px-5 py-4 tabular-nums text-muted-foreground">{index + 1}</td>
                  <td className="px-5 py-4 font-medium">{entry.studentName}</td>
                  <td className="px-5 py-4 text-muted-foreground">{entry.studentEmail || "Unavailable"}</td>
                  <td className="px-5 py-4 tabular-nums">{entry.streakDays} days</td>
                  <td className="px-5 py-4 tabular-nums">{entry.referralCount}</td>
                  <td className="px-5 py-4 font-semibold tabular-nums">{entry.entries}</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {new Intl.DateTimeFormat("en-NP", {
                      timeZone: "Asia/Kathmandu",
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(entry.confirmedAt))}
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
