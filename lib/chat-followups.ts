function normalizeLine(line: string) {
  return line
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[\).\s-]+/, "")
    .replace(/^"(.*)"$/, "$1")
    .trim();
}

export function parseFollowUpSuggestions(raw: string, limit = 3) {
  const seen = new Set<string>();
  const suggestions: string[] = [];

  for (const segment of raw.split("\n")) {
    const normalized = normalizeLine(segment);
    if (!normalized || normalized.length < 6) continue;
    if (seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    suggestions.push(normalized);
    if (suggestions.length === limit) break;
  }

  return suggestions;
}
