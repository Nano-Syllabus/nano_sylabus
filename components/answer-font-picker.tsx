"use client";

import { ChevronDown, Type } from "lucide-react";
import { useCallback, useSyncExternalStore, type CSSProperties } from "react";

/**
 * The hand worked-example answers are written in, chosen by the reader.
 *
 * The faces themselves are declared in `app/globals.css`, each sized to the
 * same lowercase height; this only names them and remembers the choice. The
 * choice belongs to the reader rather than the topic, so it is kept in this
 * browser and follows them from page to page, and a browser that will not
 * store it still honours it until the tab closes.
 */
export const ANSWER_FONTS = [
  { id: "stay-with-me", label: "Stay With Me", family: '"Stay With Me"' },
  { id: "smile-moon", label: "Smile Moon", family: '"Smile Moon"' },
  { id: "chillin-on-sunday", label: "Chillin on Sunday", family: '"Chillin on Sunday"' },
  { id: "hello-baby", label: "Hello Baby", family: '"Hello Baby"' },
  { id: "winkle", label: "Winkle", family: '"Winkle"' },
  // Not everyone reads handwriting comfortably.
  { id: "plain", label: "Plain", family: "var(--font-inter)" },
] as const;

export type AnswerFontId = (typeof ANSWER_FONTS)[number]["id"];

const DEFAULT_FONT: AnswerFontId = "stay-with-me";
const STORAGE_KEY = "ns-answer-font";

const listeners = new Set<() => void>();
let unsaved: AnswerFontId | null = null;

function isFontId(value: unknown): value is AnswerFontId {
  return ANSWER_FONTS.some((font) => font.id === value);
}

function readFont(): AnswerFontId {
  if (unsaved) return unsaved;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isFontId(stored) ? stored : DEFAULT_FONT;
  } catch {
    return DEFAULT_FONT;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab picking a face changes it here too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The reader's face, and a setter. Renders the default on the server. */
export function useAnswerFont() {
  const fontId = useSyncExternalStore(subscribe, readFont, () => DEFAULT_FONT);
  const setFontId = useCallback((next: AnswerFontId) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      unsaved = null;
    } catch {
      unsaved = next;
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [fontId, setFontId] as const;
}

/** Sets the face for every `font-revision-answer` element inside. */
export function answerFontStyle(fontId: AnswerFontId): CSSProperties {
  const font = ANSWER_FONTS.find((entry) => entry.id === fontId) ?? ANSWER_FONTS[0];
  return { "--answer-font": font.family } as CSSProperties;
}

export function AnswerFontPicker({
  value,
  onChange,
}: {
  value: AnswerFontId;
  onChange: (next: AnswerFontId) => void;
}) {
  return (
    <div className="relative">
      <label htmlFor="answer-font" className="sr-only">
        Font for worked answers
      </label>
      <Type
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
      <select
        id="answer-font"
        value={value}
        onChange={(event) => {
          if (isFontId(event.target.value)) onChange(event.target.value);
        }}
        className="min-h-9 appearance-none rounded-lg border border-border bg-bg-primary pl-8 pr-8 text-sm font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {ANSWER_FONTS.map((font) => (
          // Where the platform draws options itself, each previews in its own face.
          <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>
            {font.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
    </div>
  );
}
