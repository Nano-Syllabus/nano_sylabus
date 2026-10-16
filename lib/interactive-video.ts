/*
 * The interactive video's timing (components/interactive-video.tsx): the
 * narration's cues, and where each of the reading's chapters starts in them.
 * Pure, so it is tested without a browser.
 */

export type Cue = { start: number; end: number; text: string };

function seconds(stamp: string) {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(stamp);
  if (!m) return NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0").slice(0, 3)) / 1000;
}

/** An .srt file as cues, in order. Malformed blocks are skipped. */
export function parseSrt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.trim().split("\n");
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0) continue;
    const [from, to] = lines[timing].split("-->").map((part) => seconds(part.trim()));
    const words = lines.slice(timing + 1).join(" ").trim();
    if (Number.isFinite(from) && Number.isFinite(to) && words) cues.push({ start: from, end: to, text: words });
  }
  return cues.sort((a, b) => a.start - b.start);
}

const STOP = new Set(
  "the and for with from into that this what when where which while their there these those your you are was were how why its it's of to in on at by an a is be as or".split(
    " ",
  ),
);

/** The words of a title worth listening for. */
export function keywords(title: string) {
  return Array.from(
    new Set(
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 3 && !STOP.has(word)),
    ),
  );
}

/**
 * Where each chapter starts, in seconds. Chapter 0 starts at 0. Each later one
 * starts at the first stretch of narration (the few seconds of cues from one point, after the
 * previous chapter's start) that says enough of its title's key words; one the
 * narration never names is placed between its neighbours. Without cues the
 * chapters share the video evenly.
 */
export function chapterStarts(titles: string[], cues: Cue[], duration: number): number[] {
  const n = titles.length;
  if (!n || !(duration > 0)) return [];
  const even = titles.map((_, i) => (duration * i) / n);
  if (!cues.length) return even;
  const found: (number | null)[] = titles.map(() => null);
  found[0] = 0;
  let from = 0;
  const minGap = Math.min(8, duration / (n * 2));
  for (let i = 1; i < n; i += 1) {
    const words = keywords(titles[i]);
    if (!words.length) continue;
    const need = Math.min(2, words.length);
    for (let c = from; c < cues.length; c += 1) {
      if (cues[c].start < (found[i - 1] ?? 0) + minGap) continue;
      // What is said in the few seconds from this cue on — the cues are a word
      // group each, so a title spoken in one breath spans two or three of them.
      const window = cues
        .filter((cue) => cue.start >= cues[c].start && cue.start < cues[c].start + 4)
        .map((cue) => cue.text)
        .join(" ")
        .toLowerCase();
      if (words.filter((word) => window.includes(word)).length >= need) {
        found[i] = cues[c].start;
        from = c + 1;
        break;
      }
    }
  }
  // Fill the unnamed ones between the named, and keep the order strict.
  const out = [...found];
  for (let i = 1; i < n; i += 1) {
    if (out[i] !== null) continue;
    const prev = out[i - 1] ?? 0;
    let next = i + 1;
    while (next < n && out[next] === null) next += 1;
    const nextTime = next < n ? (out[next] as number) : duration;
    out[i] = prev + (nextTime - prev) / (next - i + 1);
  }
  for (let i = 1; i < n; i += 1) if ((out[i] as number) <= (out[i - 1] as number)) out[i] = even[i];
  return out as number[];
}
