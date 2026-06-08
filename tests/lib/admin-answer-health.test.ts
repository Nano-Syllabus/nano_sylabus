import { describe, expect, it } from "vitest";
import { buildAdminAnswerHealthSnapshot } from "@/lib/data/admin-answers";

describe("buildAdminAnswerHealthSnapshot", () => {
  it("summarizes grounded, fallback, route, and model metrics from trace metadata", () => {
    const snapshot = buildAdminAnswerHealthSnapshot([
      {
        id: "1",
        created_at: "2026-06-05T10:00:00.000Z",
        grounded: true,
        feedback: null,
        admin_reviewed_at: "2026-06-05T10:05:00.000Z",
        metadata: {
          answer_trace: {
            routePath: "topic_card_hybrid",
            routeScopeDebug: "subject=Engineering Physics",
            retrievalMode: "default",
            answerMode: "concept_answer",
            answerModeReason: "concept intent",
            matchedScope: "Engineering Physics > Unit 2",
            topicCardUsed: true,
            topicCardTitle: "Wave Motion",
            topicCardSource: "persisted",
            questionBankUsed: false,
            answerModel: "gemini-2.5-flash",
            usedFallback: false,
            usedQualityRescue: false,
            fallbackReason: null,
            grounded: true,
            ragChunks: 6,
            ragMs: 1200,
            generationMs: 2100,
            rewriteMs: 0,
            followupMs: 0,
            totalMs: 4100,
          },
        },
      },
      {
        id: "2",
        created_at: "2026-06-05T09:59:00.000Z",
        grounded: false,
        feedback: "down",
        admin_reviewed_at: null,
        metadata: {
          answer_trace: {
            routePath: "deterministic_question_bank",
            routeScopeDebug: "subject=Engineering Physics chapter=Unit 3",
            retrievalMode: "default",
            answerMode: "exam_answer",
            answerModeReason: "exam intent",
            matchedScope: "Engineering Physics > Unit 3",
            topicCardUsed: false,
            topicCardTitle: null,
            topicCardSource: null,
            questionBankUsed: true,
            answerModel: "gemini-2.5-pro",
            usedFallback: true,
            usedQualityRescue: false,
            fallbackReason: "weak grounding",
            grounded: false,
            ragChunks: 3,
            ragMs: 1400,
            generationMs: 3300,
            rewriteMs: 0,
            followupMs: 0,
            totalMs: 5900,
          },
        },
      },
    ]);

    expect(snapshot.sampleSize).toBe(2);
    expect(snapshot.groundedRate).toBe(50);
    expect(snapshot.fallbackRate).toBe(50);
    expect(snapshot.reviewedRate).toBe(50);
    expect(snapshot.topicCardRate).toBe(50);
    expect(snapshot.questionBankRate).toBe(50);
    expect(snapshot.avgTotalMs).toBe(5000);
    expect(snapshot.avgGenerationMs).toBe(2700);
    expect(snapshot.latestCapturedAt).toBe("2026-06-05T10:00:00.000Z");
    expect(snapshot.routeBreakdown).toEqual([
      { label: "deterministic_question_bank", count: 1 },
      { label: "topic_card_hybrid", count: 1 },
    ]);
    expect(snapshot.modelBreakdown).toEqual([
      { label: "gemini-2.5-flash", count: 1 },
      { label: "gemini-2.5-pro", count: 1 },
    ]);
  });
});
