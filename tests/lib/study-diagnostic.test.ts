import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasCompletedStudyDiagnostic,
  readPendingStudyAnswers,
  saveStudyDiagnostic,
  studyFlowDestination,
} from "@/lib/study-diagnostic";

const answers = Object.fromEntries([1, 2, 3, 4, 5, 6].map((questionIndex) => [
  questionIndex, { questionIndex, optionIndex: 0, text: "Yes" },
]));

function client(saved: unknown = {}, signedIn = true) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: signedIn ? { id: "account-1", user_metadata: { study_answers: saved } } : null },
    error: null,
  });
  const updateUser = vi.fn().mockResolvedValue({ error: null });
  return { supabase: { auth: { getUser, updateUser } } as unknown as SupabaseClient, getUser, updateUser };
}

describe("account-wide study diagnostic", () => {
  it("recognizes the existing signup answer format without a migration", () => {
    expect(hasCompletedStudyDiagnostic(JSON.parse(JSON.stringify(answers)))).toBe(true);
  });
  it.each([null, undefined, false, "complete", [], {}, { ...answers, 6: undefined },
    { ...answers, 6: { questionIndex: 5, optionIndex: 0, text: "Yes" } },
    { ...answers, 5: { questionIndex: 5, optionIndex: 2, text: "Invalid" } },
    { ...answers, 1: { questionIndex: 1, optionIndex: 0.5, text: "Yes" } },
    { ...answers, 1: { questionIndex: 1, optionIndex: 0, text: " " } },
  ])("does not treat missing or invalid answers as completed: %j", (value) => {
    expect(hasCompletedStudyDiagnostic(value)).toBe(false);
  });
  it("saves answers on the authenticated account for subsequent community joins", async () => {
    const { supabase, updateUser } = client();
    expect(await saveStudyDiagnostic(supabase, answers)).toBe(true);
    expect(updateUser).toHaveBeenCalledExactlyOnceWith({ data: { study_answers: answers } });
  });
  it("preserves answers already saved at signup, even if the local draft is different", async () => {
    const { supabase, updateUser } = client(answers);
    expect(await saveStudyDiagnostic(supabase, {})).toBe(true);
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("does not mark an incomplete first-time diagnostic as complete", async () => {
    const { supabase, updateUser } = client();
    expect(await saveStudyDiagnostic(supabase, { 1: answers[1] })).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("does not report completion when saving fails", async () => {
    const { supabase, updateUser } = client();
    updateUser.mockResolvedValue({ error: new Error("Save failed") });
    await expect(saveStudyDiagnostic(supabase, answers)).rejects.toThrow("Save failed");
  });
  it("requires a verified signed-in account", async () => {
    const { supabase, updateUser } = client({}, false);
    await expect(saveStudyDiagnostic(supabase, answers)).rejects.toThrow("Please sign in");
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("propagates session lookup errors without saving", async () => {
    const { supabase, getUser, updateUser } = client();
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("Offline") });
    await expect(saveStudyDiagnostic(supabase, answers)).rejects.toThrow("Offline");
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("opens the newly joined community, not a different community", () => {
    expect(studyFlowDestination("henglish")).toBe("/app/communities/henglish");
    expect(studyFlowDestination("engineering-programming")).toBe("/app/communities/engineering-programming");
  });
  it.each([undefined, "", "//evil.com", "../admin", "a?next=/admin", "a/b"])(
    "uses a safe default for invalid destinations: %s", (community) => {
      expect(studyFlowDestination(community)).toBe("/app/today");
    },
  );
  it("recovers complete pending answers after OAuth", () => {
    expect(readPendingStudyAnswers(JSON.stringify({ answers, expiresAt: 2000 }), 1000)).toEqual(answers);
  });
  it.each([null, "bad json", "null", "{}", JSON.stringify({ answers, expiresAt: 500 }),
    JSON.stringify({ answers: {}, expiresAt: 2000 }),
  ])("ignores expired or corrupt OAuth drafts: %s", (raw) => {
    expect(readPendingStudyAnswers(raw, 1000)).toBeNull();
  });
});
