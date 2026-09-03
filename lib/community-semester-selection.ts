import type { CommunityTerm } from "@/lib/communities";

export type SemesterSelection = {
  currentTermId: string;
  viewedTermId: string;
  draftTermId: string;
};

export function initialSemesterSelection(
  terms: Pick<CommunityTerm, "id" | "position">[],
  savedTermId?: string | null,
): SemesterSelection {
  const currentTermId =
    terms.find((term) => term.id === savedTermId)?.id ||
    [...terms].sort((a, b) => a.position - b.position)[0]?.id ||
    "";
  return { currentTermId, viewedTermId: currentTermId, draftTermId: currentTermId };
}

export function semesterSelectionReducer(
  state: SemesterSelection,
  action: { type: "browse" | "choose-current" | "current-saved"; termId: string },
): SemesterSelection {
  switch (action.type) {
    case "browse":
      return { ...state, viewedTermId: action.termId };
    case "choose-current":
      return { ...state, draftTermId: action.termId };
    case "current-saved":
      // Saving or reloading membership never moves the semester being browsed.
      return { ...state, currentTermId: action.termId, draftTermId: action.termId };
  }
}
