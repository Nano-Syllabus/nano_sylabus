// A local account, a disposable VPS collection, and two isolated browsers.
// node --env-file=.env.development.local scripts/content-camera-smoke.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { globSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const base = process.env.CONTENT_CAMERA_APP_URL || "http://localhost:3000";
const dbUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
assert.equal(dbUrl.hostname, "127.0.0.1", "Only local Supabase may be used for this smoke check.");
assert.equal(dbUrl.port, "54321");
assert.equal(
  process.env.VPS_STORAGE_PATH_PREFIX,
  "development",
  "Only isolated development VPS objects may be used.",
);
const admin = createClient(dbUrl.toString(), process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const check = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const handle = `camera-smoke-${Date.now()}`;
const email = `${handle}@example.test`;
const screenshots = path.join(os.tmpdir(), handle);
mkdirSync(screenshots);
const password = crypto.randomBytes(24).toString("base64url");
let teacherId, userId, browser, phoneContext, upstreamCreated;
const api = async (page, resource, body, method = body ? "POST" : "GET") =>
  page.evaluate(
    async ({ resource, body, method }) => {
      const response = await fetch(resource, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body && JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          `${resource.split("/").slice(0, 4).join("/")}: ${response.status} ${result.error ?? "error"}`,
        );
      return result;
    },
    { resource, body, method },
  );
function tenant(resource, token, body, method = body ? "POST" : "GET") {
  const url = new URL(resource, process.env.TENANT_API_BASE_URL);
  const bytes = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method,
        agent: false,
        rejectUnauthorized: process.env.TENANT_API_REJECT_UNAUTHORIZED === "1",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(bytes ? { "Content-Length": bytes.length } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString();
          if (res.statusCode >= 400)
            return reject(new Error(`Fixture request ${resource}: HTTP ${res.statusCode}`));
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch {
            reject(new Error("Invalid fixture response"));
          }
        });
      },
    );
    req.setTimeout(30000, () => req.destroy(new Error(`Fixture request timed out: ${resource}`)));
    req.on("error", reject);
    if (bytes) req.write(bytes);
    req.end();
  });
}
try {
  console.log("Creating disposable camera collection…");
  const created = await tenant("/v1/teacher-app/teachers", process.env.TEACHER_APP_API_TOKEN, {
    handle,
    create_login: false,
  });
  upstreamCreated = true;
  console.log("Preparing disposable subject…");
  const key = created.api_key;
  assert(key, "The disposable collection key was returned");
  for (const shelf of ["Syllabus", "Notes", "Question Bank"]) {
    await tenant("/v1/collection/mkdir", key, { path: `Camera Test/${shelf}` });
  }
  const { subject } = await tenant("/v1/collection/subjects", key, {
    name: "Camera Test",
    folder_path: "Camera Test",
  });
  userId = check(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user
    .id;
  check(
    await admin
      .from("student_profiles")
      .upsert({ user_id: userId, full_name: "Camera smoke test", role: "super_admin" }),
  );
  teacherId = check(
    await admin
      .from("teachers")
      .insert({ user_id: userId, handle, collection_sk: key })
      .select("id")
      .single(),
  ).id;
  check(
    await admin
      .from("teacher_subject_profiles")
      .insert({
        teacher_id: teacherId,
        subject_slug: subject.slug,
        subject_name: subject.name,
        folder_path: subject.folder_path,
      }),
  );
  const cookies = new Map();
  const auth = createServerClient(
    dbUrl.toString(),
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => [...cookies.values()],
        setAll: (entries) => entries.forEach((entry) => cookies.set(entry.name, entry)),
      },
    },
  );
  check(await auth.auth.signInWithPassword({ email, password }));
  const chrome = globSync("chromium-*/chrome-linux*/chrome", {
    cwd: path.join(os.homedir(), ".cache/ms-playwright"),
  })[0];
  browser = await puppeteer.launch({
    headless: true,
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      path.join(os.homedir(), ".cache/ms-playwright", chrome),
    args: ["--no-sandbox"],
  });
  await browser.setCookie(
    ...[...cookies.values()].map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: new URL(base).hostname,
      path: "/",
      secure: false,
      sameSite: "Lax",
    })),
  );
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1440, height: 1050 });
  const errors = [];
  desktop.on("pageerror", (error) => errors.push(error.message));
  const clickText = async (page, text) => {
    await page.waitForFunction(
      (text) =>
        [...document.querySelectorAll("button")].some(
          (button) => button.textContent.trim() === text && !button.disabled,
        ),
      { timeout: 60000 },
      text,
    );
    await page.evaluate(
      (text) =>
        [...document.querySelectorAll("button")]
          .find((button) => button.textContent.trim() === text && !button.disabled)
          .click(),
      text,
    );
  };
  console.log("Opening creator upload dialog…");
  await desktop.goto(`${base}/teachers?view=subjects&subject=${subject.slug}&tab=material`, {
    waitUntil: "networkidle2",
    timeout: 90000,
  });
  await clickText(desktop, "Add material");
  await clickText(desktop, "Phone camera");
  await desktop.waitForSelector('a[aria-label="Open phone camera link"]', { timeout: 60000 });
  const uploadUrl = await desktop.$eval(
    'a[aria-label="Open phone camera link"]',
    (anchor) => anchor.href,
  );
  assert.equal(new URL(uploadUrl).origin, new URL(base).origin, "QR uses the browser address, including a LAN hostname");
  const segments = new URL(uploadUrl).pathname.split("/");
  const opened = { id: segments[2], token: segments[3], uploadUrl };
  const captureApi = `/api/content-camera/${opened.id}/${opened.token}`;
  phoneContext = await browser.createBrowserContext();
  const phone = await phoneContext.newPage();
  phone.on("pageerror", (error) => errors.push(error.message));
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await phone.goto(opened.uploadUrl, { waitUntil: "networkidle2", timeout: 60000 });
  assert.equal(
    await phone.$eval('input[capture="environment"]', (input) => input.accept),
    "image/*",
  );
  assert.equal(
    (await phone.cookies()).some((cookie) => cookie.name.includes("auth-token")),
    false,
    "Phone has no login cookies",
  );
  const photos = [];
  for (const [index, background] of ["#f6d4b9", "#bbdfef", "#cbe8b1"].entries()) {
    const file = path.join(screenshots, `page-${index + 1}.jpg`);
    await sharp({ create: { width: 700 + index * 100, height: 1000, channels: 3, background } })
      .jpeg()
      .toFile(file);
    photos.push(file);
  }
  await (await phone.$('input[aria-label="Choose page photos"]')).uploadFile(...photos);
  await desktop.waitForFunction(
    () => document.querySelectorAll('[role="dialog"] ol li').length === 3,
    { timeout: 60000 },
  );
  await phone.waitForFunction(
    () =>
      document.querySelectorAll("ol li").length === 3 &&
      ![...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Preview PDF",
      )?.disabled,
    { timeout: 60000 },
  );
  const before = await api(phone, captureApi);
  assert(
    before.pages.every(
      (page) => page.source === "phone" && page.previewUrl.startsWith("/vps-storage/"),
    ),
  );
  const original = before.pages.map((page) => page.id);
  await desktop.focus("button[data-grip]");
  await desktop.keyboard.press("ArrowRight");
  await desktop.waitForResponse(
    (response) => response.url().endsWith(captureApi) && response.request().method() === "POST",
    { timeout: 10000 },
  );
  const ordered = await api(desktop, captureApi);
  assert.deepEqual(
    ordered.pages.map((page) => page.id),
    [original[1], original[0], original[2]],
  );
  await clickText(desktop, "Preview PDF");
  await desktop.waitForSelector('iframe[title="Scanned content PDF preview"]');
  const result = await desktop.evaluate(async () => {
    const bytes = new Uint8Array(
      await (
        await fetch(document.querySelector('iframe[title="Scanned content PDF preview"]').src)
      ).arrayBuffer(),
    );
    return new TextDecoder("latin1").decode(bytes);
  });
  assert(result.startsWith("%PDF-1.4"));
  assert(result.includes("/Count 3"));
  await desktop.screenshot({ path: path.join(screenshots, "desktop.png"), fullPage: true });
  await phone.screenshot({ path: path.join(screenshots, "phone.png"), fullPage: true });
  // Real signed VPS upload + existing creator indexing path, including mirror.
  const indexed = desktop.waitForResponse(
    (response) =>
      response.url().endsWith("/api/teacher/upload") &&
      response.request().postData()?.includes('"action":"complete"'),
    { timeout: 90000 },
  );
  await clickText(desktop, "Upload PDF and index");
  const completed = await indexed;
  assert.equal(completed.status(), 200, "Generated PDF uploaded and indexing accepted");
  const stored = check(
    await admin
      .from("teacher_document_files")
      .select("original_name,mime_type,storage_path")
      .eq("teacher_id", teacherId),
  );
  assert.equal(stored.length, 1);
  assert.equal(stored[0].mime_type, "application/pdf");
  await phone.waitForFunction(
    () => document.body.textContent.includes("This camera session has ended"),
    { timeout: 15000 },
  );
  const ended = await phone.evaluate(
    async (resource) => (await fetch(resource)).status,
    captureApi,
  );
  assert.equal(ended, 410, "Phone token revoked after content upload");
  const session = check(
    await admin.from("content_camera_sessions").select("pages,closed").eq("id", opened.id).single(),
  );
  assert.equal(session.closed, true);
  assert(session.pages.every((page) => !Object.keys(page).includes("bytes")));
  assert.deepEqual(errors, []);
  console.log(
    `Camera browser smoke passed: anonymous phone capture, desktop sync/order, three-page PDF, VPS upload/index, QR revocation. Screenshots: ${screenshots}`,
  );
} finally {
  await phoneContext?.close();
  await browser?.close();
  if (teacherId) {
    const sessions = check(
      await admin.from("content_camera_sessions").select("id,pages").eq("teacher_id", teacherId),
    );
    const files = check(
      await admin.from("teacher_document_files").select("storage_path").eq("teacher_id", teacherId),
    );
    // The fixture's PDFs and photos live on the VPS, never Supabase Storage.
    const storageUrl = process.env.VPS_STORAGE_URL || process.env.TENANT_API_BASE_URL;
    const storageToken = process.env.VPS_STORAGE_TOKEN || process.env.TENANT_API_TOKEN;
    const originalBase = process.env.TENANT_API_BASE_URL;
    const removeObject = async (bucket, object) => {
      process.env.TENANT_API_BASE_URL = storageUrl;
      try {
        await tenant(
          `/v1/object-storage/object/${bucket}/development/${object.split("/").map(encodeURIComponent).join("/")}`,
          storageToken,
          undefined,
          "DELETE",
        );
      } finally {
        process.env.TENANT_API_BASE_URL = originalBase;
      }
    };
    for (const session of sessions)
      for (const page of session.pages) await removeObject("content-camera", page.path);
    for (const file of files) await removeObject("teacher-documents", file.storage_path);
    check(await admin.from("content_camera_sessions").delete().eq("teacher_id", teacherId));
    check(await admin.from("teacher_document_files").delete().eq("teacher_id", teacherId));
    check(await admin.from("teacher_subject_profiles").delete().eq("teacher_id", teacherId));
    check(await admin.from("teachers").delete().eq("id", teacherId));
  }
  if (userId) check(await admin.auth.admin.deleteUser(userId));
  if (upstreamCreated)
    await tenant(
      `/v1/teacher-app/teachers/${handle}`,
      process.env.TEACHER_APP_API_TOKEN,
      undefined,
      "DELETE",
    );
}
