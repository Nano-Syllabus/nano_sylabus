import fs from "node:fs";
import path from "node:path";

/** Minimal .env reader — these scripts run outside Next, so nothing loads these for us. */
export function loadEnvFiles(root) {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split("\n")) {
      const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = (match[2] ?? "").trim();
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
}

/**
 * Signs in through the real login form and returns where the app landed.
 *
 * Returns early when there is nothing to sign into: an already-authenticated
 * session — or a dev server running with DEV_AUTH_BYPASS — bounces /login
 * straight to the app, so no form ever appears.
 */
export async function signIn(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });

  if (!new URL(page.url()).pathname.startsWith("/login")) {
    return `${page.url()} (already authenticated — no sign-in needed)`;
  }

  await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
  await page.type('input[type="email"]', email, { delay: 8 });
  await page.type('input[type="password"]', password, { delay: 8 });
  await Promise.all([
    page.click('button[type="submit"]'),
    page
      .waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 60_000 })
      .catch(() => null),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (new URL(page.url()).pathname.startsWith("/login")) {
    const message = await page.$eval("form", (form) => form.innerText).catch(() => "");
    throw new Error(`Login failed — still on /login. Form said: ${message.slice(0, 300)}`);
  }
  return page.url();
}
