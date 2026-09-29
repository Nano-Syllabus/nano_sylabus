/**
 * "1.4 Semiconductor Devices" → "Semiconductor Devices".
 *
 * The page already numbers units by position ("UNIT 3"), so the syllabus's own
 * section number in the title read as a second, conflicting one ("UNIT 3 · 1.4
 * …"). Leading "Unit 2:", "Chapter 3 -", "1.", "1.4", "IV." all go; a title that
 * is nothing but a number is kept as it was.
 */
export function stripUnitNumber(title: string) {
  const stripped = title
    .replace(
      new RegExp(
        [
          // "Unit 2: …", "Chapter IV - …", "Module 3 …"
          String.raw`^\s*(?:unit|chapter|module)\s*(?:\d+(?:\.\d+)*|[ivxlc]+)\b\s*[:.)\-–—]?\s*`,
          // "1.4 …", "2) …", "3. …"
          String.raw`^\s*\d+(?:\.\d+)*\s*[:.)\-–—]?\s+`,
          // "IV. …" — a bare numeral only WITH its punctuation, or "Civil …" would go
          String.raw`^\s*[ivxlc]+[.:)]\s+`,
        ].join("|"),
        "i",
      ),
      "",
    )
    .trim();
  return stripped || title.trim();
}
