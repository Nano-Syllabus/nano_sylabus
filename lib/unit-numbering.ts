/**
 * WHETHER A SUBJECT'S UNITS ARE WORTH NAMING.
 *
 * A subject carved out of a larger syllabus keeps that syllabus's numbering: the
 * licence exam's "Data Structures and Algorithm…" is its chapter 7, so its
 * topics arrived as Unit 7.1, 7.2 … and read as though six units were missing.
 * A subject is shown on its own, so its units either count from 1 or are not
 * mentioned at all — the way a subject with no unit numbers already reads
 * (user, 2026-09-24).
 */

function leadingNumber(unit: string) {
  const match = /^\s*(\d+)/.exec(unit);
  return match ? Number(match[1]) : null;
}

/** True when the subject's lowest unit is unit 1 (or 1.x). */
export function unitsStartAtOne(unitNumbers: Array<string | null | undefined>) {
  const leading = unitNumbers
    .map((unit) => (unit ? leadingNumber(unit) : null))
    .filter((value): value is number => value !== null);
  return leading.length > 0 && Math.min(...leading) === 1;
}

/**
 * One unit seen alone, with no view of its subject: a dotted number is a chapter
 * of a larger syllabus unless that chapter is the first.
 */
export function unitShownAlone(unit: string | null | undefined) {
  if (!unit?.trim()) return false;
  return !unit.includes(".") || leadingNumber(unit) === 1;
}
