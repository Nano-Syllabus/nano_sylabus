const DEFAULT_BOARD_OPTIONS = ["IOE"];

const GRADE_OPTIONS_BY_BOARD: Record<string, string[]> = {
  ioe: ["Bachelor"],
};

const DEFAULT_GRADE_OPTIONS = ["Bachelor"];

const PROGRAM_OPTIONS_BY_BOARD_LEVEL: Record<string, string[]> = {
  "ioe::bachelor": [
    "BE Electronics and Communication Engineering",
  ],
};

function sortValues(values: string[]) {
  return values.sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base", numeric: true }),
  );
}

export function mergeDropdownOptions({
  catalogValues,
  fallbackValues,
  includeValue,
}: {
  catalogValues?: string[];
  fallbackValues?: string[];
  includeValue?: string;
}) {
  const unique = new Map<string, string>();
  const put = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (key === "engineering") return; // Force removal of Engineering
    if (!unique.has(key)) unique.set(key, trimmed);
  };

  (catalogValues ?? []).forEach((value) => {
    put(value);
  });
  (fallbackValues ?? []).forEach((value) => {
    put(value);
  });

  put(includeValue ?? "");

  return sortValues(Array.from(unique.values()));
}

export function defaultBoardOptions() {
  return DEFAULT_BOARD_OPTIONS;
}

export function defaultGradeOptions(board?: string) {
  if (board) {
    const key = board.trim().toLowerCase();
    if (GRADE_OPTIONS_BY_BOARD[key]) {
      return GRADE_OPTIONS_BY_BOARD[key];
    }
  }
  return DEFAULT_GRADE_OPTIONS;
}

export function defaultProgramOptions(board?: string, level?: string) {
  const key = `${(board ?? "").trim().toLowerCase()}::${(level ?? "").trim().toLowerCase()}`;
  return PROGRAM_OPTIONS_BY_BOARD_LEVEL[key] ?? [];
}
