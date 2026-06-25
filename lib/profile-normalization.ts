function compactWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function capitalizeWord(word: string) {
  if (!word) return word;
  if (/^[A-Z0-9]+$/.test(word) && ACRONYM_WORDS.has(word)) {
    return word;
  }
  return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
}

const ACRONYM_WORDS = new Set(["NEB", "TU", "PU", "KU", "CTEVT", "IOE", "BBS", "BCA", "BSC", "BA", "BIM", "BIT"]);

export function normalizeBoard(value: string) {
  const compact = compactWhitespace(value);
  if (!compact) return "";
  const upper = compact.toUpperCase();
  const acronyms = ["NEB", "TU", "PU", "KU", "CTEVT", "IOE"];
  if (acronyms.includes(upper)) return upper;
  if (upper === "ENGINEERING") return "IOE";
  // Non-acronym boards (e.g., "IOE") — preserve Title Case to match DB values.
  return compact
    .split(" ")
    .map((word) => capitalizeWord(word))
    .join(" ");
}

export function normalizeGrade(value: string) {
  const compact = compactWhitespace(value);
  if (!compact) return "";

  const classMatch = compact.match(/^class\s*(\d{1,2})$/i) || compact.match(/^(\d{1,2})$/);
  if (classMatch) {
    return `Class ${classMatch[1]}`;
  }

  const bachelorMatch =
    compact.match(/^bachelor$/i) ||
    compact.match(/^bachelor\s+year\s*(?:[1-4]|i{1,3}|iv)$/i) ||
    compact.match(/^bachelor\s*(?:[1-4]|i{1,3}|iv)$/i);
  if (bachelorMatch) {
    return "Bachelor";
  }

  return compact
    .split(" ")
    .map((word) => {
      if (/^\d+$/.test(word)) return word;
      if (ACRONYM_WORDS.has(word.toUpperCase())) return word.toUpperCase();
      return capitalizeWord(word);
    })
    .join(" ");
}

export function normalizeSubjectLabel(value: string) {
  const compact = compactWhitespace(value);
  if (!compact) return "";

  return compact
    .split(" ")
    .map((word) => {
      if (/^\d+$/.test(word)) return word;
      if (word.length <= 4 && /^[a-z]+$/i.test(word)) return word.toUpperCase();
      return capitalizeWord(word);
    })
    .join(" ");
}

export function normalizeSubjects(values: string[]) {
  const deduped = new Map<string, string>();

  values.forEach((value) => {
    const normalized = normalizeSubjectLabel(value);
    if (!normalized) return;
    deduped.set(normalized.toLowerCase(), normalized);
  });

  return Array.from(deduped.values());
}

export function normalizeTargetGrade(value: string) {
  return compactWhitespace(value);
}

export function normalizeFullName(value: string) {
  return compactWhitespace(value);
}

export function normalizeCollege(value: string) {
  return compactWhitespace(value);
}

export function normalizeBoardScore(value: string) {
  return compactWhitespace(value);
}

export function validateBoardScore(value: string, scoreType: "%" | "GPA") {
  const compact = compactWhitespace(value);
  if (!compact) return null;

  const numeric = Number(compact);
  if (Number.isNaN(numeric)) {
    return scoreType === "%" ? "Score must be a number between 0 and 100." : "GPA must be a number between 0 and 4.0.";
  }

  if (scoreType === "%") {
    if (numeric < 0 || numeric > 100) return "Score must be between 0 and 100.";
  } else if (numeric < 0 || numeric > 4) {
    return "GPA must be between 0 and 4.0.";
  }

  return null;
}
