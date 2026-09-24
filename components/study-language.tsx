"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ChallengeRomanNepali } from "@/lib/data/student-challenges";
import { cn } from "@/lib/utils";

/**
 * English or Roman Nepali, for what a student studies from: a challenge's
 * concepts reading and its worked answers, in the challenge and in Revision.
 *
 * Past questions and the exam stay as the paper prints them — the exam a student
 * sits is in English, and a past question is quoted, not paraphrased.
 *
 * The choice is the reader's and is remembered in this browser, the way the
 * answer font is. It starts in English: turning it on is what pays for a topic's
 * first translation, so it is not switched on for everyone at once.
 */

export type StudyLanguage = "en" | "rn";

const STORAGE_KEY = "ns-study-language";
const DEFAULT_LANGUAGE: StudyLanguage = "en";
const listeners = new Set<() => void>();
let unsaved: StudyLanguage | null = null;

function readLanguage(): StudyLanguage {
  if (unsaved) return unsaved;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "rn" ? "rn" : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The reader's language, and a setter. English on the server. */
export function useStudyLanguage() {
  const language = useSyncExternalStore(subscribe, readLanguage, () => DEFAULT_LANGUAGE);
  const setLanguage = useCallback((next: StudyLanguage) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      unsaved = null;
    } catch {
      unsaved = next;
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [language, setLanguage] as const;
}

type Translation =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: ChallengeRomanNepali }
  | { status: "error"; message: string };

/** Kept across mounts, so leaving step 1 and coming back does not ask again. */
const translations = new Map<string, ChallengeRomanNepali>();

/**
 * A challenge's Roman Nepali, fetched when it is wanted.
 *
 * `version` names the English it should be a translation of — the number of
 * reading paragraphs and worked answers is enough — so a reading that lands
 * after the translation was fetched asks again, and the rest is kept.
 */
export function useRomanNepali(
  challengeId: string,
  version: string,
  wanted: boolean,
  /** The translation already filed on the challenge row, when there is one. It
   *  arrives with the challenge, so a translated challenge opens translated with
   *  no request at all. Used only when it covers the English now on screen. */
  stored?: ChallengeRomanNepali | null,
  /** Hands a freshly written translation to a screen that caches the challenge. */
  onLoaded?: (data: ChallengeRomanNepali) => void,
): Translation {
  const key = `${challengeId}:${version}`;
  const covering =
    stored && `${stored.reading.length}:${Object.keys(stored.solutions).length}` === version ? stored : null;
  const [state, setState] = useState<Translation>(() => {
    const held = translations.get(key) ?? covering;
    return held ? { status: "ready", data: held } : { status: "idle" };
  });
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  useEffect(() => {
    const held = translations.get(key) ?? covering;
    if (held) {
      setState({ status: "ready", data: held });
      return;
    }
    if (!wanted) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const response = await fetch(`/api/student/challenges/${encodeURIComponent(challengeId)}/roman-nepali`);
        const payload = (await response.json().catch(() => ({}))) as {
          romanNepali?: ChallengeRomanNepali;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !payload.romanNepali) {
          setState({
            status: "error",
            message: payload.error || "This couldn't be put into Roman Nepali right now. Showing English.",
          });
          return;
        }
        // Kept partial or whole: the server files it on the row either way, and
        // the parts left in English are ones the translator refuses every time.
        // All of it in English is the service failing — shown, never kept.
        const data = payload.romanNepali;
        const parts = data.reading.length + Object.keys(data.solutions).length;
        if (data.untranslated < parts) {
          translations.set(key, data);
          onLoadedRef.current?.(data);
        }
        setState({ status: "ready", data });
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "Couldn't reach NanoSyllabus. Showing English." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // `covering` is derived from `stored` and `key`; the key already changes
    // whenever the English it must cover does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, key, wanted]);

  return state;
}

/** What the reader sees in place of `english`, in the chosen language. */
export function inStudyLanguage(
  language: StudyLanguage,
  translation: Translation,
  pick: (data: ChallengeRomanNepali) => string | string[] | undefined,
  english: string,
): string;
export function inStudyLanguage(
  language: StudyLanguage,
  translation: Translation,
  pick: (data: ChallengeRomanNepali) => string | string[] | undefined,
  english: string[],
): string[];
export function inStudyLanguage(
  language: StudyLanguage,
  translation: Translation,
  pick: (data: ChallengeRomanNepali) => string | string[] | undefined,
  english: string | string[],
) {
  if (language !== "rn" || translation.status !== "ready") return english;
  const picked = pick(translation.data);
  if (Array.isArray(english)) {
    return Array.isArray(picked) && picked.length === english.length ? picked : english;
  }
  return typeof picked === "string" && picked.trim() ? picked : english;
}

/**
 * The English | Roman Nepali switch, and one line saying what the Roman Nepali
 * is doing: being written, partly in English, or unavailable.
 */
export function StudyLanguageSwitch({
  value,
  onChange,
  translation,
  className,
}: {
  value: StudyLanguage;
  onChange: (next: StudyLanguage) => void;
  translation: Translation;
  className?: string;
}) {
  const note =
    value !== "rn"
      ? ""
      : translation.status === "loading"
        ? "Putting this into Roman Nepali…"
        : translation.status === "error"
          ? translation.message
          : translation.status === "ready" && translation.data.untranslated
            ? "Some parts couldn't be translated and are shown in English."
            : "";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
      <div
        role="radiogroup"
        aria-label="Language for the reading and worked answers"
        className="inline-flex rounded-lg border border-border bg-bg-secondary p-0.5"
      >
        {(
          [
            ["en", "English"],
            ["rn", "Roman Nepali"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            className={cn(
              "min-h-8 rounded-md px-3 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              value === id
                ? "bg-bg-primary text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {note ? (
        <p role="status" aria-live="polite" className="text-xs text-text-muted">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** Whether the reader is waiting on a first Roman Nepali translation. */
export function isTranslating(language: StudyLanguage, translation: Translation) {
  return language === "rn" && translation.status === "loading";
}

/**
 * Where translated text will land, while it is being written. The English is
 * not left on screen meanwhile: the reader asked for Roman Nepali, and English
 * that changes under them a few seconds in reads as the switch not working.
 */
export function TranslatingLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5 py-1", className)} aria-busy="true" aria-label="Putting this into Roman Nepali">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="block h-3 animate-pulse rounded bg-border motion-reduce:animate-none"
          style={{ width: index === lines - 1 ? "62%" : "100%" }}
        />
      ))}
    </div>
  );
}
