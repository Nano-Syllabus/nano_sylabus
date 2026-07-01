import { describe, expect, it } from "vitest";
import { buildAdminAnswerHealthSnapshot } from "@/lib/data/admin-answers";

describe("buildAdminAnswerHealthSnapshot", () => {
  it("summarizes tenant route and model metrics from trace metadata", () => {
    const snapshot = buildAdminAnswerHealthSnapshot([
      {
        id: "1",
        created_at: "2026-06-05T10:00:00.000Z",
        grounded: true,
        feedback: null,
        admin_reviewed_at: "2026-06-05T10:05:00.000Z",
        metadata: {
          answer_trace: {
            routePath: "tenant_prompt",
            routeScopeDebug: "subject=Engineering Physics",
            retrievalMode: "default",
            answerMode: "tenant_prompt",
            answerModeReason: "raw_question_sent_to_tenant",
            matchedScope: "Engineering Physics > Unit 2",
            answerModel: "tenant:v1/prompt",
            grounded: true,
            citationCount: 6,
            lookupMs: 1200,
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
            routePath: "tenant_prompt",
            routeScopeDebug: "subject=Engineering Physics chapter=Unit 3",
            retrievalMode: "default",
            answerMode: "tenant_prompt",
            answerModeReason: "raw_question_sent_to_tenant",
            matchedScope: "Engineering Physics > Unit 3",
            answerModel: "tenant:v1/prompt",
            grounded: false,
            citationCount: 3,
            lookupMs: 1400,
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
    expect(snapshot.reviewedRate).toBe(50);
    expect(snapshot.avgTotalMs).toBe(5000);
    expect(snapshot.avgGenerationMs).toBe(2700);
    expect(snapshot.latestCapturedAt).toBe("2026-06-05T10:00:00.000Z");
    expect(snapshot.routeBreakdown).toEqual([
      { label: "tenant_prompt", count: 2 },
    ]);
    expect(snapshot.modelBreakdown).toEqual([
      { label: "tenant:v1/prompt", count: 2 },
    ]);
  });
});
