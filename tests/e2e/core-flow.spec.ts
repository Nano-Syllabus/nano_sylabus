import { expect, test, type Page } from "@playwright/test";
import {
  assertE2ESchemaReady,
  cleanupStaticKnowledgeChunk,
  createE2ETestUser,
  deleteE2ETestUser,
  seedEnglishStudyFixture,
} from "./supabase-admin";

async function loginAndCompleteOnboardingIfNeeded(
  page: Page,
  user: Awaited<ReturnType<typeof createE2ETestUser>>,
) {
  await page.goto("/login");

  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Login" }).click();

  await page.waitForURL(/\/(onboarding|app\/chat)/, { timeout: 30000 });

  if (!page.url().includes("/onboarding")) {
    return;
  }

  await page.getByLabel("Full name").fill("E2E Nano Student");
  await page.getByLabel("Institution").fill("St. Xavier's College");
  await page.getByRole("button", { name: "Next →" }).click();

  await page.getByLabel("Board").fill("NEB");
  await page.getByLabel("Faculty").fill("Class 11");
  await page.getByRole("button", { name: "Next →" }).click();

  await page.getByLabel(/Score/).fill("82");
  await page.getByRole("button", { name: "Next →" }).click();

  await page.getByLabel("Subjects").fill("English");
  await page.getByRole("button", { name: "Next →" }).click();

  await page.getByLabel("Target result").fill("A+");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("button", { name: /Start learning/i }).click();
  await page.waitForURL("**/app/chat", { timeout: 30000 });
}

test.describe("Nano Syllabus core student flow", () => {
  let user: Awaited<ReturnType<typeof createE2ETestUser>>;
  let fixture: Awaited<ReturnType<typeof seedEnglishStudyFixture>>;

  test.beforeAll(async () => {
    await assertE2ESchemaReady();
    user = await createE2ETestUser();
    fixture = await seedEnglishStudyFixture(user.userId);
  });

  test.afterAll(async () => {
    await cleanupStaticKnowledgeChunk(fixture?.source);
    if (user?.userId) {
      await deleteE2ETestUser(user.userId);
    }
  });

  test("English student journey covers grounded chat, notes, source trust, revision gate, and explore", async ({
    page,
    context,
  }) => {
    test.setTimeout(180000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await loginAndCompleteOnboardingIfNeeded(page, user);

    await page.goto(`/app/chat?session=${fixture.sessionId}`);
    await expect(page).toHaveURL(new RegExp(`/app/chat\\?session=${fixture.sessionId}`));
    await expect(page.getByText(/20 credits available/i)).toBeVisible();
    await expect(page.locator("#subject-context")).toHaveValue("English");
    await expect(page.getByText(/Subject focus: English/i)).toBeVisible();
    await expect(page.getByText(fixture.question)).toBeVisible();
    await expect(page.getByText(/technology changes campus discovery/i)).toBeVisible();

    await expect(page.getByRole("button", { name: "Save as note" })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Helpful/ })).toBeVisible();
    await expect(page.getByText("Suggested follow-ups")).toBeVisible();
    await expect(page.getByText(fixture.source.title)).toBeVisible();

    await page.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByText("Answer copied to clipboard.")).toBeVisible();

    const feedbackResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/chat/messages/") &&
        response.url().includes("/feedback") &&
        response.request().method() === "PATCH",
    );
    await page.locator('[data-testid^="feedback-up-"]').first().click();
    const feedbackResponse = await feedbackResponsePromise;
    expect(feedbackResponse.ok()).toBeTruthy();

    const firstFollowUp = page.locator('[data-testid^="followup-chip-"]').first();
    const firstFollowUpText = (await firstFollowUp.textContent())?.trim() || "";
    const composer = page.getByPlaceholder("Ask a question about your studies...");
    await firstFollowUp.click();
    await expect(composer).toHaveValue(firstFollowUpText);

    await page.goto(`/app/sources/${fixture.source.chunkId}`);
    await expect(page).toHaveURL(new RegExp(`/app/sources/${fixture.source.chunkId}`));
    await expect(page.getByRole("heading", { name: fixture.source.title })).toBeVisible();
    await expect(page.getByText(/Grounded excerpt/i)).toBeVisible();
    await expect(page.getByText(/english-serendipity\.pdf/i)).toBeVisible();

    await page.goto(`/app/chat?session=${fixture.sessionId}`);
    await page.getByRole("button", { name: "Save as note" }).click();
    const saveNoteDialog = page.getByTestId("save-note-modal");
    await expect(saveNoteDialog.getByRole("heading", { name: "Save as note" })).toBeVisible();
    await expect(saveNoteDialog.getByTestId("save-note-subject")).toHaveValue("English");
    await saveNoteDialog.getByTestId("save-note-annotation").fill("Important for board exam.");
    await saveNoteDialog.getByRole("button", { name: "Save note" }).click();
    await expect(saveNoteDialog).toBeHidden({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Edit note" }).first()).toBeVisible({
      timeout: 30000,
    });

    await page.goto("/app/notes");
    await expect(page).toHaveURL(/\/app\/notes$/);
    await expect(page.getByRole("link", { name: /Upgrade for revision/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /In English, summarize Taking my Son/i })).toBeVisible({
      timeout: 30000,
    });
    const savedNoteCard = page.getByRole("link", { name: /In English, summarize Taking my Son/i });
    await expect(savedNoteCard.getByText("English", { exact: true })).toBeVisible();

    await savedNoteCard.click();
    await expect(page.getByText(/Original question/i)).toBeVisible();
    await expect(page.getByText(/Important for board exam\./i)).toBeVisible();
    await expect(page.getByText(fixture.source.title)).toBeVisible();
    await expect(page.getByRole("link", { name: /Ask follow-up/i })).toBeVisible();

    await page.goto("/app/notes/revision");
    await page.waitForURL("**/app/notes/revision", { timeout: 30000 });
    await expect(page.getByText(/Revision mode is a paid feature/i)).toBeVisible();

    await page.goto("/app/explore");
    await expect(page.getByRole("heading", { name: "English", exact: true })).toBeVisible();

    const englishCard = page.locator("article").filter({
      has: page.getByRole("heading", { name: "English" }),
    });
    await expect(englishCard).toBeVisible();

    await page.goto("/app/explore/English");
    await expect(page).toHaveURL(/\/app\/explore\/English/);
    await expect(page.getByRole("heading", { name: "English", exact: true })).toBeVisible();
    await expect(page.getByText("Taking my Son to College summary")).toBeVisible();
    await expect(page.getByText(/2 turns/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Open →/i })).toBeVisible();
  });

  test("fresh English question hits the real chat route and returns a grounded streamed answer", async ({
    page,
  }) => {
    test.setTimeout(180000);
    await loginAndCompleteOnboardingIfNeeded(page, user);

    await page.goto("/app/chat?subject=English");
    await expect(page.locator("#subject-context")).toHaveValue("English");
    await expect(page.getByText(/This chat will start with a English focus\./i)).toBeVisible();
    await expect(page.getByText(/20 credits available/i)).toBeVisible();

    const composer = page.getByPlaceholder("Ask a question about your studies...");
    await composer.fill(
      "In English, summarize Taking my Son to College, Where Technology has Replaced Serendipity.",
    );
    await page.getByRole("button", { name: /Send/i }).click();

    await expect(page).toHaveURL(/\/app\/chat\?session=/, { timeout: 30000 });
    await expect(
      page.getByText(
        /technology changes campus discovery and human connection, replacing some of the unplanned encounters/i,
      ),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#subject-context")).toHaveValue("English");
    await expect(page.getByText(/Subject focus: English/i)).toBeVisible();
    await expect(page.getByText(/19 credits available/i)).toBeVisible();
    const sourceDetailLink = page.getByRole("link", { name: /Open source detail/i }).first();
    await sourceDetailLink.scrollIntoViewIfNeeded();
    await expect(sourceDetailLink).toBeVisible();
    await expect(page.getByText("Suggested follow-ups")).toBeVisible();
    await expect(page.getByText(/What does serendipity mean in this essay\?/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save as note" })).toBeVisible();
  });
});
