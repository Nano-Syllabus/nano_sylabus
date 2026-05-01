import { expect, test } from "@playwright/test";
import {
  assertE2ESchemaReady,
  createE2ETestUser,
  deleteE2ETestUser,
} from "./supabase-admin";

test.describe("Nano Syllabus core student flow", () => {
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

  test("logs in, completes onboarding, chats, saves a note, revises, and explores by subject", async ({
    page,
    context,
  }) => {
    test.setTimeout(180000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const firstQuestion = "Physics ko Newton second law roman nepali ma bujhaideu.";

    await page.goto("/login");

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Login" }).click();

    await page.waitForURL("**/onboarding", { timeout: 30000 });

    await page.getByLabel("Full name").fill("E2E Nano Student");
    await page.getByLabel("Institution").fill("St. Xavier's College");
    await page.getByRole("button", { name: "Next →" }).click();

    await page.getByLabel("Grade or year").fill("Class 11");
    await page.getByRole("button", { name: "Next →" }).click();

    await page.getByLabel(/Score/).fill("82");
    await page.getByRole("button", { name: "Next →" }).click();

    await page.getByLabel("Subjects").fill("Physics, Chemistry, Mathematics");
    await page.getByRole("button", { name: "Next →" }).click();

    await page.getByLabel("Target result").fill("A+");
    await page.getByRole("button", { name: "Roman Nepali" }).click();
    await page.getByRole("button", { name: /Start learning/i }).click();

    await page.waitForURL("**/app/chat", { timeout: 30000 });
    await expect(page.getByText(/credits available/i)).toBeVisible();

    const composer = page.getByPlaceholder("Ask a question about your studies...");
    await composer.fill(firstQuestion);
    await page.getByRole("button", { name: /Send/i }).click();

    await expect(page.getByRole("button", { name: "Save as note" })).toBeVisible({
      timeout: 90000,
    });
    await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Helpful/ })).toBeVisible();
    await expect(page.getByText("Suggested follow-ups")).toBeVisible();

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
    await firstFollowUp.click();
    await expect(composer).toHaveValue(firstFollowUpText);

    await page.getByRole("button", { name: "Save as note" }).click();
    await expect(page.getByRole("heading", { name: "Save as note" })).toBeVisible();
    await page.getByLabel("Subject").fill("Physics");
    await page.getByLabel("Annotation").fill("Important for board exam.");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Note saved.")).toBeVisible();

    await page.goto("/app/notes");
    await expect(page).toHaveURL(/\/app\/notes$/);
    await expect(page.getByRole("link", { name: /Start revision/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Physics ko Newton second law/i })).toBeVisible({
      timeout: 30000,
    });

    await page.getByRole("link", { name: /Start revision/i }).click();
    await page.waitForURL("**/app/notes/revision", { timeout: 30000 });
    await page.getByRole("button", { name: /Begin/i }).click();
    await page.getByRole("button", { name: /Show answer/i }).click();
    await page.getByRole("button", { name: /Need review/i }).click();
    await expect(page.getByText("Session complete")).toBeVisible({ timeout: 30000 });

    await page.goto("/app/explore");
    await expect(page.getByRole("heading", { name: "Physics", exact: true })).toBeVisible();

    const physicsCard = page.locator("article").filter({
      has: page.getByRole("heading", { name: "Physics" }),
    });
    await physicsCard.getByRole("link", { name: "Open subject" }).click();

    await expect(page).toHaveURL(/\/app\/explore\/Physics/);
    await expect(page.getByRole("heading", { name: "Physics", exact: true })).toBeVisible();
    await expect(page.getByText(/Physics ko Newton second law roman nepali ma bujhaideu\./i)).toBeVisible();
  });
});
