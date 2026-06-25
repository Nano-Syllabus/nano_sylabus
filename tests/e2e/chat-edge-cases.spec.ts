import { expect, test } from "@playwright/test";
import {
  assertE2ESchemaReady,
  cleanupStaticKnowledgeChunk,
  createE2ETestUser,
  deleteE2ETestUser,
  seedStaticKnowledgeChunk,
} from "./supabase-admin";

function asDataStream(text: string) {
  return `0:${JSON.stringify(text)}\n`;
}

test.describe("Nano Syllabus chat edge cases", () => {
  let user: Awaited<ReturnType<typeof createE2ETestUser>>;

  test.beforeAll(async () => {
    await assertE2ESchemaReady();
    user = await createE2ETestUser();
  });

  test.afterAll(async () => {
    if (user?.userId) {
      await deleteE2ETestUser(user.userId);
    }
  });

  test("infers subject context from a no-subject question and keeps it across follow-up", async ({
    page,
  }) => {
    test.setTimeout(180000);
    const sourceFixture = await seedStaticKnowledgeChunk({
      board: "NEB",
      grade: "Class 11",
      subject: "English",
      chapter: "Unit 1",
      topic: "Serendipity",
      title: "Class 11 English Serendipity",
      sourceName: "english-serendipity.pdf",
      content:
        "Taking my Son to College, Where Technology has Replaced Serendipity reflects on campus life, discovery, and the loss of unplanned encounters.",
    });
    const mockedSessionId = "11111111-1111-1111-1111-111111111111";
    let chatCallCount = 0;
    let creditCallCount = 0;
    let sessionFetchCount = 0;

    try {
      await page.goto("/login");

      await page.getByLabel("Email").fill(user.email);
      await page.getByLabel("Password").fill(user.password);
      await page.getByRole("button", { name: "Login" }).click();

      await page.waitForURL(/\/(onboarding|app\/chat)/, { timeout: 30000 });

      if (page.url().includes("/onboarding")) {
        await page.getByLabel("Full name").fill("E2E Edge Student");
        await page.getByLabel("Institution").fill("St. Xavier's College");
        await page.getByRole("button", { name: "Next →" }).click();

        await page.getByLabel("Board").fill("neb");
        await page.getByLabel("Faculty").fill("11");
        await page.getByRole("button", { name: "Next →" }).click();

        await page.getByLabel(/Score/).fill("82");
        await page.getByRole("button", { name: "Next →" }).click();

        await page.getByLabel("Subjects").fill("physics, chemistry, mathematics, english");
        await page.getByRole("button", { name: "Next →" }).click();

        await page.getByLabel("Target result").fill("A+");
        await page.getByRole("button", { name: "English" }).click();
        await page.getByRole("button", { name: /Start learning/i }).click();
        await page.waitForURL("**/app/chat", { timeout: 30000 });
      }

      await page.route("**/api/chat", async (route) => {
        chatCallCount += 1;
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "x-session-id": mockedSessionId,
            "x-rag-grounded": "1",
            "x-rag-chunks": "1",
            "x-subject-context": "English",
            "x-thinking-enabled": "1",
            "x-answer-mode": chatCallCount === 1 ? "deep" : "quick",
          },
          body: asDataStream(
            chatCallCount === 1
              ? "The essay reflects on how technology changes campus discovery and human connection."
              : "A follow-up point is that serendipity means valuable unplanned discovery in student life.",
          ),
        });
      });

      await page.route(`**/api/chat/session?session=${mockedSessionId}`, async (route) => {
        sessionFetchCount += 1;
        const firstAssistant = {
          id: "assistant-message-1",
          sessionId: mockedSessionId,
          role: "assistant",
          content:
            "The essay reflects on how technology changes campus discovery and human connection.",
          language: "EN",
          createdAt: new Date().toISOString(),
          grounded: true,
          citations: [
            {
              chunkId: sourceFixture.chunkId,
              documentId: sourceFixture.documentId,
              sourceLabel: "English · Unit 1",
              sourceTitle: sourceFixture.title,
              sourceName: "english-serendipity.pdf",
              subject: "English",
              chapter: "Unit 1",
              topic: "Serendipity",
              excerpt:
                "Taking my Son to College, Where Technology has Replaced Serendipity reflects on campus life, discovery, and the loss of unplanned encounters.",
            },
          ],
          feedback: null,
          followUpSuggestions: ["What does serendipity mean in this essay?"],
          savedNoteId: null,
        };

        const messages =
          sessionFetchCount === 1
            ? [
                {
                  id: "user-message-1",
                  sessionId: mockedSessionId,
                  role: "user",
                  content:
                    "In English, summarize Taking my Son to College, Where Technology has Replaced Serendipity.",
                  language: "EN",
                  createdAt: new Date().toISOString(),
                  grounded: false,
                  citations: [],
                  feedback: null,
                  followUpSuggestions: [],
                  savedNoteId: null,
                },
                firstAssistant,
              ]
            : [
                {
                  id: "user-message-1",
                  sessionId: mockedSessionId,
                  role: "user",
                  content:
                    "In English, summarize Taking my Son to College, Where Technology has Replaced Serendipity.",
                  language: "EN",
                  createdAt: new Date().toISOString(),
                  grounded: false,
                  citations: [],
                  feedback: null,
                  followUpSuggestions: [],
                  savedNoteId: null,
                },
                firstAssistant,
                {
                  id: "user-message-2",
                  sessionId: mockedSessionId,
                  role: "user",
                  content: "What does serendipity mean in this essay?",
                  language: "EN",
                  createdAt: new Date().toISOString(),
                  grounded: false,
                  citations: [],
                  feedback: null,
                  followUpSuggestions: [],
                  savedNoteId: null,
                },
                {
                  id: "assistant-message-2",
                  sessionId: mockedSessionId,
                  role: "assistant",
                  content:
                    "A follow-up point is that serendipity means valuable unplanned discovery in student life.",
                  language: "EN",
                  createdAt: new Date().toISOString(),
                  grounded: true,
                  citations: [
                    {
                      chunkId: sourceFixture.chunkId,
                      documentId: sourceFixture.documentId,
                      sourceLabel: "English · Unit 1",
                      sourceTitle: sourceFixture.title,
                      sourceName: "english-serendipity.pdf",
                      subject: "English",
                      chapter: "Unit 1",
                      topic: "Serendipity",
                      excerpt:
                        "Taking my Son to College, Where Technology has Replaced Serendipity reflects on campus life, discovery, and the loss of unplanned encounters.",
                    },
                  ],
                  feedback: null,
                  followUpSuggestions: [],
                  savedNoteId: null,
                },
              ];

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: mockedSessionId,
            userId: user.userId,
            title: "Taking my Son to College summary",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            subjectTags: ["English"],
            subjectContext: "English",
            messages,
          }),
        });
      });

      await page.route("**/api/billing/credits", async (route) => {
        creditCallCount += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ balance: creditCallCount === 1 ? 19 : 18 }),
        });
      });

      await expect(page).toHaveURL(/\/app\/chat/);
      await expect(page.getByText(/20 credits available/i)).toBeVisible();
      await expect(page.locator("#subject-context")).toHaveValue("");

      const composer = page.getByPlaceholder("Ask a question about your studies...");
      await composer.fill("In English, summarize Taking my Son to College, Where Technology has Replaced Serendipity.");
      await page.getByRole("button", { name: /Send/i }).click();

      await expect(page.getByRole("button", { name: "Save as note" })).toBeVisible({
        timeout: 30000,
      });
      await expect(page.locator("#subject-context")).toHaveValue("English");
      await expect(page.getByText(/Subject focus: English/i)).toBeVisible();
      await expect(page.getByText(/19 credits available/i)).toBeVisible();

      const firstFollowUp = page.locator('[data-testid^="followup-chip-"]').first();
      await firstFollowUp.click();
      await page.getByRole("button", { name: /Send/i }).click();

      await expect(page.getByRole("button", { name: "Copy" })).toHaveCount(2, {
        timeout: 30000,
      });
      await expect(page.locator("#subject-context")).toHaveValue("English");
      await expect(page.getByText(/18 credits available/i)).toBeVisible();

      await page.getByRole("link", { name: /Open source detail/i }).first().click();
      await expect(page).toHaveURL(new RegExp(`/app/sources/${sourceFixture.chunkId}`));
      await expect(page.getByRole("heading", { name: sourceFixture.title })).toBeVisible();
      await expect(page.getByText(/Grounded excerpt/i)).toBeVisible();
      await expect(page.getByText(/english-serendipity\.pdf/i)).toBeVisible();
    } finally {
      await cleanupStaticKnowledgeChunk(sourceFixture);
    }
  });

  test("keeps General context for a grounded multi-subject question", async ({ page }) => {
    test.setTimeout(180000);
    const dedicatedUser = await createE2ETestUser();
    const mockedSessionId = "22222222-2222-2222-2222-222222222222";
    const mockedSourceTitles = ["E2E Physics Bridge Problem", "E2E Mathematics Bridge Problem"];

    try {
      await page.goto("/login");

      await page.getByLabel("Email").fill(dedicatedUser.email);
      await page.getByLabel("Password").fill(dedicatedUser.password);
      await page.getByRole("button", { name: "Login" }).click();

      await page.waitForURL(/\/(onboarding|app\/chat)/, { timeout: 30000 });

      if (page.url().includes("/onboarding")) {
        await page.getByLabel("Full name").fill("E2E Multi Subject Student");
        await page.getByLabel("Institution").fill("St. Xavier's College");
        await page.getByRole("button", { name: "Next →" }).click();

        await page.getByLabel("Board").fill("neb");
        await page.getByLabel("Faculty").fill("11");
        await page.getByRole("button", { name: "Next →" }).click();

        await page.getByLabel(/Score/).fill("82");
        await page.getByRole("button", { name: "Next →" }).click();

        await page.getByLabel("Subjects").fill("physics, mathematics");
        await page.getByRole("button", { name: "Next →" }).click();

        await page.getByLabel("Target result").fill("A+");
        await page.getByRole("button", { name: "English" }).click();
        await page.getByRole("button", { name: /Start learning/i }).click();
        await page.waitForURL("**/app/chat", { timeout: 30000 });
      }

      await page.route("**/api/chat", async (route) => {
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "x-session-id": mockedSessionId,
            "x-rag-grounded": "1",
            "x-rag-chunks": "2",
            "x-subject-context": "",
            "x-thinking-enabled": "1",
            "x-answer-mode": "deep",
          },
          body: asDataStream(
            "This answer compares the Physics and Mathematics sides of the same bridge problem.",
          ),
        });
      });

      await page.route(`**/api/chat/session?session=${mockedSessionId}`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: mockedSessionId,
            userId: dedicatedUser.userId,
            title: "BridgeScope integrated comparison",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            subjectTags: ["Physics", "Mathematics"],
            subjectContext: null,
            messages: [
              {
                id: "user-message-1",
                sessionId: mockedSessionId,
                role: "user",
                content: "Explain the shared bridge problem using both Physics and Mathematics.",
                language: "EN",
                createdAt: new Date().toISOString(),
                grounded: false,
                citations: [],
                feedback: null,
                followUpSuggestions: [],
                savedNoteId: null,
              },
              {
                id: "assistant-message-1",
                sessionId: mockedSessionId,
                role: "assistant",
                content: "This answer compares the Physics and Mathematics sides of the same bridge problem.",
                language: "EN",
                createdAt: new Date().toISOString(),
                grounded: true,
                citations: [
                  {
                    chunkId: "chunk-physics",
                    documentId: "doc-physics",
                    sourceLabel: "Physics · Unit 1",
                    sourceTitle: mockedSourceTitles[0],
                    sourceName: "physics-bridge.pdf",
                    subject: "Physics",
                    chapter: "Unit 1",
                    topic: "Bridge problem",
                    excerpt: "Physics focuses on force, motion, and observable interpretation.",
                  },
                  {
                    chunkId: "chunk-math",
                    documentId: "doc-math",
                    sourceLabel: "Mathematics · Unit 1",
                    sourceTitle: mockedSourceTitles[1],
                    sourceName: "math-bridge.pdf",
                    subject: "Mathematics",
                    chapter: "Unit 1",
                    topic: "Bridge problem",
                    excerpt: "Mathematics focuses on formulas, algebra, and symbolic calculation.",
                  },
                ],
                feedback: null,
                followUpSuggestions: [],
                savedNoteId: null,
              },
            ],
          }),
        });
      });

      await page.route("**/api/billing/credits", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ balance: 19 }),
        });
      });

      await expect(page).toHaveURL(/\/app\/chat/);
      await expect(page.getByText(/20 credits available/i)).toBeVisible();
      await expect(page.locator("#subject-context")).toHaveValue("");

      const composer = page.getByPlaceholder("Ask a question about your studies...");
      await composer.fill("Explain the shared bridge problem using both Physics and Mathematics.");
      await page.getByRole("button", { name: /Send/i }).click();

      await expect(page.getByRole("button", { name: "Save as note" })).toBeVisible({
        timeout: 90000,
      });
      await expect(page.locator("#subject-context")).toHaveValue("");
      await expect(page.getByText(/Subject focus:/i)).toHaveCount(0);
      await expect(page.getByText(mockedSourceTitles[0])).toBeVisible();
      await expect(page.getByText(mockedSourceTitles[1])).toBeVisible();
      await expect(page.getByText(/19 credits available/i)).toBeVisible();
    } finally {
      await deleteE2ETestUser(dedicatedUser.userId);
    }
  });
});
