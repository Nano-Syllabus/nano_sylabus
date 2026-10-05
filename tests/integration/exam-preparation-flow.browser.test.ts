import puppeteer from "puppeteer";
import { describe, expect, it } from "vitest";

// Run against a local preview with an enabled exam. Checkout requests are
// intercepted so this test never creates an enrollment, payment or session.
const baseUrl = process.env.EXAM_FLOW_BASE_URL;
const examSlug = process.env.EXAM_FLOW_SLUG || "license";

describe.skipIf(!baseUrl)("exam preparation in the browser", () => {
  it("continues to plans with the faculty and answers, then carries them to sign-in", async () => {
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      let submitted: Record<string, unknown> | undefined;
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname === `/api/exam-enrollment/${examSlug}/intent` && request.method() === "POST") {
          submitted = JSON.parse(request.postData() || "null");
          void request.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ next: `/payment/${examSlug}` }),
          });
        } else if (url.pathname === "/login") {
          void request.respond({ status: 200, contentType: "text/html", body: "Sign-in destination" });
        } else {
          void request.continue();
        }
      });

      await page.goto(`${baseUrl}/prepare/${examSlug}`, { waitUntil: "networkidle2" });
      const chosenAnswers: string[] = [];
      for (let index = 0; index < 8 && !(await page.$(".ns-ef-cta")); index++) {
        const heading = await page.$eval("h1", (element) => element.textContent);
        chosenAnswers.push(await page.$eval("button[aria-pressed]", (element) => element.textContent?.trim() || ""));
        await page.click("button[aria-pressed]");
        await page.waitForFunction(
          (previous) => document.querySelector("h1")?.textContent !== previous,
          {},
          heading,
        );
      }

      const join = await page.$('button[aria-label^="Join "]');
      expect(join).not.toBeNull();
      const facultyName = await join!.evaluate((element) => element.getAttribute("aria-label")?.replace(/^Join /, ""));
      await page.locator('button[aria-label^="Join "]').click();
      await page.waitForFunction(() => !(document.querySelector(".ns-ef-cta") as HTMLButtonElement)?.disabled);
      await page.locator(".ns-ef-cta").click();
      await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Choose your plan", { timeout: 10000 });
      expect(await page.$eval("main", (element) => element.textContent)).toContain(facultyName);

      // Going back to faculties must also retain the choice.
      await page.evaluate(() => {
        const change = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Change");
        change?.click();
      });
      await page.waitForSelector(".ns-ef-cta");
      expect(await page.$eval(".ns-ef-cta", (element) => element.textContent)).toContain(`Continue as ${facultyName}`);
      await page.click(".ns-ef-cta");
      await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Choose your plan");

      await page.click("article button");
      await page.waitForFunction(() => location.pathname === "/login");
      expect(submitted).toMatchObject({ examSlug, billingMonths: 1 });
      expect(submitted?.facultySlug).toBeTruthy();
      expect(Object.values(submitted?.answers as Record<string, string>)).toEqual(chosenAnswers);
      const next = new URL(page.url()).searchParams.get("next");
      const payment = new URL(next!, baseUrl);
      expect(payment.pathname).toBe(`/payment/${examSlug}`);
      expect(JSON.parse(payment.searchParams.get("intent")!)).toEqual(submitted);
    } finally {
      await browser.close();
    }
  }, 60000);
});
