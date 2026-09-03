import { describe, expect, it } from "vitest";
import {
  initialSemesterSelection,
  semesterSelectionReducer,
} from "@/lib/community-semester-selection";
import { communityLearningFixture } from "../helpers/learning-database";
import { getCommunity } from "@/lib/data/communities";
import { setCommunityCurrentTerm } from "@/lib/data/community-hub";

const terms = [1, 2, 3].map((number) => ({ id: `term-${number}`, position: number - 1 }));

describe("current semester versus browsing", () => {
  it("keeps the saved current semester locked while browsing every other tab", () => {
    let state = initialSemesterSelection(terms, "term-1");
    for (const term of ["term-2", "term-3", "term-1", "term-2"]) {
      state = semesterSelectionReducer(state, { type: "browse", termId: term });
      expect(state).toEqual({ currentTermId: "term-1", draftTermId: "term-1", viewedTermId: term });
    }
  });
  it("only changes current after an explicit successful save", () => {
    let state = initialSemesterSelection(terms, "term-1");
    state = semesterSelectionReducer(state, { type: "choose-current", termId: "term-3" });
    expect(state.currentTermId).toBe("term-1");
    state = semesterSelectionReducer(state, { type: "browse", termId: "term-2" });
    expect(state.draftTermId).toBe("term-3");
    state = semesterSelectionReducer(state, { type: "current-saved", termId: "term-3" });
    expect(state).toEqual({
      currentTermId: "term-3",
      draftTermId: "term-3",
      viewedTermId: "term-2",
    });
  });
  it("reloads the saved semester rather than the last browsed one", () => {
    const state = semesterSelectionReducer(initialSemesterSelection(terms, "term-1"), {
      type: "browse",
      termId: "term-3",
    });
    expect(initialSemesterSelection(terms, state.currentTermId).viewedTermId).toBe("term-1");
  });
  it("uses the first academic semester for missing or invalid saved preferences", () => {
    expect(initialSemesterSelection([...terms].reverse(), "removed").currentTermId).toBe("term-1");
    expect(initialSemesterSelection(terms, null).currentTermId).toBe("term-1");
    expect(initialSemesterSelection([], null).currentTermId).toBe("");
  });
  it("round-trips the member preference through the save service and community loader", async () => {
    const db = communityLearningFixture();
    db.tables.communities[0].visibility = "public";
    db.tables.community_memberships[0].current_term_id = "term-1";
    db.tables.community_memberships[1].current_term_id = "term-3";
    const admin = Object.assign(db.admin, {
      rpc: async (_name: string, args: Record<string, string>) => {
        const member = db.tables.community_memberships.find(
          (row) =>
            row.user_id === args.target_user_id && row.community_id === args.target_community_id,
        );
        if (!member) throw new Error("Unexpected membership");
        member.current_term_id = args.target_term_id;
        return { data: null, error: null };
      },
    });
    expect((await getCommunity("henglish", "member", admin))?.membership?.currentTermId).toBe(
      "term-1",
    );
    expect(await setCommunityCurrentTerm("member", "henglish", "term-2", admin)).toEqual({
      currentTermId: "term-2",
    });
    expect((await getCommunity("henglish", "member", admin))?.membership?.currentTermId).toBe(
      "term-2",
    );
    expect(db.tables.community_memberships[1].current_term_id).toBe("term-3");
    expect((await getCommunity("henglish", null, admin))?.membership).toBeNull();
  });
});
