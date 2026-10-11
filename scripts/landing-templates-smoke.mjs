// Local integration check: node --env-file=.env.development.local scripts/landing-templates-smoke.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { globSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import puppeteer from "puppeteer";

const base = "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, "127.0.0.1", "This smoke check only writes to local Supabase.");
assert.equal(new URL(url).port, "54321");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const prefix = `landing-smoke-${Date.now()}`;
const email = `${prefix}@example.test`;
const password = crypto.randomBytes(24).toString("base64url");
const slugs = [
  prefix,
  ...["original", "academy", "community", "editorial"].map((id) => `${prefix}-${id}`),
];
const screenshots = path.join(os.tmpdir(), prefix);
mkdirSync(screenshots);
let userId;
let browser;
const checked = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
try {
  userId = checked(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Landing sample smoke test" },
    }),
  ).user.id;
  checked(
    await admin
      .from("student_profiles")
      .upsert({ user_id: userId, full_name: "Landing sample smoke test", role: "super_admin" }),
  );
  const cookies = new Map();
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...cookies.values()],
      setAll: (entries) => entries.forEach((entry) => cookies.set(entry.name, entry)),
    },
  });
  checked(await client.auth.signInWithPassword({ email, password }));
  const cachedChrome = globSync("chromium-*/chrome-linux*/chrome", {
    cwd: path.join(os.homedir(), ".cache/ms-playwright"),
  })[0];
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (cachedChrome && path.join(os.homedir(), ".cache/ms-playwright", cachedChrome));
  browser = await puppeteer.launch({ headless: true, executablePath, args: ["--no-sandbox"] });
  await browser.setCookie(
    ...[...cookies.values()].map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: "localhost",
      path: "/",
      sameSite: "Lax",
      secure: false,
    })),
  );
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const clickText = async (label) => {
    await page.waitForFunction(
      (label) =>
        Array.from(document.querySelectorAll("button")).some(
          (button) => button.textContent.trim() === label,
        ),
      { timeout: 60000 },
      label,
    );
    await page.evaluate(
      (label) =>
        Array.from(document.querySelectorAll("button"))
          .find((button) => button.textContent.trim() === label)
          .click(),
      label,
    );
  };
  const api = async (resource, method = "GET", body) =>
    page.evaluate(
      async ({ resource, method, body }) => {
        const response = await fetch(resource, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body && JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(`${resource}: HTTP ${response.status} ${JSON.stringify(data)}`);
        return data;
      },
      { resource, method, body },
    );
  await page.goto(`${base}/admin/sites`, { waitUntil: "networkidle2", timeout: 60000 });
  await clickText("New subdomain");
  assert.equal(
    await page.$$eval('[aria-label="Landing page samples"] article', (nodes) => nodes.length),
    5,
  );
  await page.type('input[placeholder="highschool"]', prefix);
  await page.type('input[placeholder="High School Prep"]', "Landing smoke test");
  await page.click('button[aria-label="Select Studio sample"]');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/sites") && response.request().method() === "POST",
  );
  await clickText("Create and edit");
  const created = await (await createdResponse).json();
  assert.equal(created.site.draft.design.template, "studio");
  assert.equal(created.site.status, "hidden");
  await page.waitForFunction(
    (slug) => location.pathname === `/admin/sites/${slug}`,
    { timeout: 60000 },
    prefix,
  );
  await page.waitForSelector('button[aria-label="Phone preview"]', { timeout: 60000 });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('aside[aria-label="Page sections"] button'))
      .find((button) => button.textContent.includes("Hero") && !button.getAttribute("aria-label"))
      .click(),
  );
  const headline = '[data-field-path="hero.titleLead"] input';
  await page.waitForSelector(headline);
  await page.click(headline);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(headline, "Custom smoke headline");
  await page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/admin/sites/${prefix}`) &&
      response.request().method() === "PATCH",
    { timeout: 20000 },
  );
  assert.equal(
    (await api(`/api/admin/sites/${prefix}`)).site.draft.hero.titleLead,
    "Custom smoke headline",
  );
  await clickText("Choose sample");
  await page.click('button[aria-label="Select Editorial sample"]');
  const switchedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/admin/sites/${prefix}`) &&
      response.request().method() === "PATCH",
    { timeout: 20000 },
  );
  await clickText("Apply sample to draft");
  await switchedResponse;
  let saved = (await api(`/api/admin/sites/${prefix}`)).site;
  assert.equal(saved.draft.design.template, "editorial");
  assert.equal(saved.draft.hero.titleLead, "Custom smoke headline");
  assert.equal(saved.content.design.template, "studio");
  await clickText("All sections");
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('aside[aria-label="Page sections"] button'))
      .find((button) => button.textContent.includes("Design & layout"))
      .click(),
  );
  await page.select('[data-field-path="design.font"] select', "mono");
  await page.select('[data-field-path="design.corners"] select', "square");
  await page.select('[data-field-path="design.spacing"] select', "compact");
  const background = '[aria-label="Page background hex code"]';
  await page.click(background);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.type(background, "#fffef0");
  const designed = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/admin/sites/${prefix}`) &&
      response.request().method() === "PATCH" &&
      response.request().postData()?.includes('"heroImageUrl":"/landing-new/notebook.png"'),
    { timeout: 20000 },
  );
  await page.type('[aria-label="Hero image URL"]', "/landing-new/notebook.png");
  await designed;
  await clickText("All sections");
  const hidden = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/admin/sites/${prefix}`) &&
      response.request().method() === "PATCH",
    { timeout: 20000 },
  );
  await page.click('button[aria-label="Hide Feature cards"]');
  await hidden;
  saved = (await api(`/api/admin/sites/${prefix}`)).site;
  assert.equal(saved.draft.design.font, "mono");
  assert.equal(saved.draft.design.backgroundColor, "#fffef0");
  assert.equal(saved.draft.design.heroImageUrl, "/landing-new/notebook.png");
  assert.equal(saved.draft.features.hidden, true);
  const publishedResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/admin/sites/${prefix}/publish`),
  );
  await clickText("Publish");
  await publishedResponse;
  saved = (await api(`/api/admin/sites/${prefix}`)).site;
  assert.equal(saved.content.design.template, "editorial");
  assert.equal(saved.content.hero.titleLead, "Custom smoke headline");
  await api(`/api/admin/sites/${prefix}`, "PATCH", { status: "live" });
  const publicPage = await browser.newPage();
  const subdomain = await publicPage.goto(`http://${prefix}.localhost:3000/`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  assert.equal(subdomain.status(), 200);
  const live = await publicPage.content();
  assert.ok(live.includes('data-landing-template="editorial"'));
  assert.ok(live.includes("Custom smoke headline"));
  assert.equal(await publicPage.$('[data-landing-section="features"]'), null);
  assert.equal(
    await publicPage.$eval(
      '[data-landing-template="editorial"]',
      (element) => getComputedStyle(element).backgroundColor,
    ),
    "rgb(255, 254, 240)",
  );
  await publicPage.close();
  console.log(
    "PASS: create, edit text and design, hide a section, autosave, switch sample, publish, and render the subdomain.",
  );

  for (const [i, templateId] of ["original", "academy", "community", "editorial"].entries()) {
    const site = await api("/api/admin/sites", "POST", {
      slug: slugs[i + 1],
      name: `Smoke ${templateId}`,
      templateId,
    });
    assert.equal(site.site.draft.design.template, templateId);
  }
  for (const template of ["original", "editorial", "academy", "studio", "community"]) {
    const preview = await browser.newPage();
    preview.on("pageerror", (error) => errors.push(error.message));
    await preview.setViewport({ width: 1440, height: 1000 });
    await preview.goto(`${base}/admin/landing-samples/${template}`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await preview.waitForSelector(`[data-landing-template="${template}"]`, { timeout: 60000 });
    assert.equal(await preview.$('[aria-label="Admin navigation"]'), null);
    assert.ok(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await preview.screenshot({ path: path.join(screenshots, `${template}-desktop.png`) });
    await preview.setViewport({ width: 390, height: 844 });
    assert.ok(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await preview.screenshot({ path: path.join(screenshots, `${template}-phone.png`) });
    await preview.close();
    console.log(`PASS: ${template} sample at desktop and phone widths.`);
  }
  assert.deepEqual(errors, []);
  const invalid = await page.evaluate(
    async () =>
      (
        await fetch("/api/admin/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "should-not-be-created",
            name: "Invalid",
            templateId: "unknown",
          }),
        })
      ).status,
  );
  assert.equal(invalid, 400);
  console.log(`Screenshots: ${screenshots}`);
} finally {
  if (browser) await browser.close();
  if (userId) {
    const activity = await admin.from("faculty_activity").delete().eq("actor_id", userId);
    if (activity.error && activity.error.code !== "PGRST205")
      console.error("Activity cleanup:", activity.error.message);
    const cleanup = await Promise.allSettled([
      admin.from("landing_sites").delete().in("slug", slugs).then(checked),
      admin.auth.admin.deleteUser(userId).then(checked),
    ]);
    for (const result of cleanup)
      if (result.status === "rejected") console.error("Cleanup failed:", result.reason.message);
    console.log("Removed the local test account and sample sites.");
  }
}
