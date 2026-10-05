"use client";

import { useEffect, useState } from "react";

type Options = {
  plans: Array<{ id: string; name: string }>;
  exams: Array<{ slug: string; name: string; faculties: Array<{ id: string; name: string }> }>;
  enrollment: { examSlug: string; facultyId: string; facultyName: string } | null;
};

const MONTH_CHIPS = [1, 3, 6, 12];
const inputClass =
  "min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/40";

/**
 * Super admin: gift Plus or Pro for a number of months, for one faculty only.
 * The student is locked to that faculty (the same lock a paying student gets),
 * so the plan only ever opens that faculty's study space.
 */
export function AdminGiftPlan({ userId, onGifted }: { userId: string; onGifted: () => void }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState("");
  const [months, setMonths] = useState("1");
  const [target, setTarget] = useState(""); // "examSlug|facultyId"
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/users/${userId}/gift-plan`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Gift options could not be loaded.");
        const loaded = payload as Options;
        setOptions(loaded);
        setPlanId(loaded.plans[0]?.id ?? "");
        setTarget(
          loaded.enrollment
            ? `${loaded.enrollment.examSlug}|${loaded.enrollment.facultyId}`
            : loaded.exams[0]?.faculties[0]
              ? `${loaded.exams[0].slug}|${loaded.exams[0].faculties[0].id}`
              : "",
        );
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Gift options could not be loaded.");
      });
    return () => controller.abort();
  }, [userId]);

  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (!options)
    return <div className="h-24 animate-pulse rounded-lg bg-border/60" aria-label="Loading" />;
  if (!options.plans.length || !options.exams.length)
    return (
      <p className="text-sm text-muted-foreground">
        Turn on an exam with at least one faculty (Admin → Websites) to gift plans.
      </p>
    );

  const [examSlug, facultyId] = target.split("|");
  const exam = options.exams.find((item) => item.slug === examSlug);
  const faculty = exam?.faculties.find((item) => item.id === facultyId);
  const plan = options.plans.find((item) => item.id === planId);
  const count = Number(months);
  const valid = Number.isInteger(count) && count >= 1 && count <= 24 && Boolean(plan && faculty);
  const moves =
    options.enrollment &&
    (options.enrollment.examSlug !== examSlug || options.enrollment.facultyId !== facultyId);

  async function gift() {
    if (!valid) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/gift-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          months: count,
          examSlug,
          facultyId,
          changeFaculty: Boolean(moves),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The plan could not be gifted.");
      setMessage(
        `Gifted ${plan?.name} for ${count} month${count === 1 ? "" : "s"} — ${faculty?.name} only.`,
      );
      setOptions({
        ...options!,
        enrollment: { examSlug, facultyId, facultyName: faculty!.name },
      });
      onGifted();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The plan could not be gifted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Plan">
        {options.plans.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={planId === item.id}
            onClick={() => setPlanId(item.id)}
            className={`min-h-9 flex-1 rounded-md px-2 text-sm font-medium ${
              planId === item.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Months">
          {MONTH_CHIPS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={months === String(value)}
              onClick={() => setMonths(String(value))}
              className={`min-h-9 rounded-full border px-4 text-sm font-medium ${
                months === String(value)
                  ? "border-blue-600 bg-blue-600/10 text-blue-700 dark:text-blue-300"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {value} {value === 1 ? "month" : "months"}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          Or exactly
          <input
            aria-label="Months"
            inputMode="numeric"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
            className={`${inputClass} w-20 tabular-nums`}
          />
          months (1–24)
        </label>
      </div>

      <label className="block text-sm font-medium">
        Faculty
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className={`${inputClass} mt-1`}
        >
          {options.exams.map((item) => (
            <optgroup key={item.slug} label={item.name}>
              {item.faculties.map((entry) => (
                <option key={entry.id} value={`${item.slug}|${entry.id}`}>
                  {entry.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <p className="text-xs leading-5 text-muted-foreground">
        {moves
          ? `Currently locked to ${options.enrollment!.facultyName}. Gifting moves them to ${faculty?.name}.`
          : options.enrollment
            ? `Locked to ${options.enrollment.facultyName}.`
            : `Not in a faculty yet. This locks them to ${faculty?.name ?? "the faculty"}.`}{" "}
        The plan only opens that faculty.
      </p>

      <button
        type="button"
        onClick={() => void gift()}
        disabled={!valid || busy}
        className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy
          ? "Gifting…"
          : valid
            ? `Gift ${plan!.name} · ${count} month${count === 1 ? "" : "s"} · ${faculty!.name}`
            : "Choose plan, months and faculty"}
      </button>
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
