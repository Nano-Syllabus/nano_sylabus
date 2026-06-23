const DEFAULT_BOARD_OPTIONS = ["Engineering", "NEB"];

const GRADE_OPTIONS_BY_BOARD: Record<string, string[]> = {
  engineering: [
    "Bachelor Year I",
    "Bachelor Year II",
    "Bachelor Year III",
    "Bachelor Year IV",
  ],
  neb: ["Class 11", "Class 12"],
};

const DEFAULT_GRADE_OPTIONS = [
  "Class 11",
  "Class 12",
  "Bachelor Year I",
  "Bachelor Year II",
  "Bachelor Year III",
  "Bachelor Year IV",
];

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
