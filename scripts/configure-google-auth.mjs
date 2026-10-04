import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const environment = process.argv[2];
const apply = process.argv.includes("--apply");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}; add it to private .env.google.local.`);
  return value;
}

function enableButton(file) {
  const text = readFileSync(file, "utf8");
  const updated = /^NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=/m.test(text)
    ? text.replace(/^NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=.*$/m, "NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true")
    : `${text.trimEnd()}\nNEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true\n`;
  writeFileSync(file, updated, { mode: 0o600 });
}

async function jsonRequest(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    // Do not print remote bodies: Auth configuration can contain secrets.
    throw new Error(`Auth configuration request failed (HTTP ${response.status}). Use a Management API token with Auth read/write access to this project.`);
  }
  return response.json();
}

try {
  if (!["development", "staging"].includes(environment)) throw new Error("Select development or staging.");
  const clientId = required("GOOGLE_OAUTH_CLIENT_ID");
  const secret = required("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!clientId.endsWith(".apps.googleusercontent.com")) throw new Error("Use a Google OAuth Web application client ID, not a Google Drive API key.");

  if (environment === "development") {
    const file = path.join(root, "development/supabase/config.toml");
    const config = readFileSync(file, "utf8");
    if (!/\[auth\.external\.google\]\s*\nenabled = (true|false)/.test(config)) throw new Error("Development Google provider configuration is missing.");
    console.log("Google authorized redirect URI: http://127.0.0.1:54321/auth/v1/callback");
    if (apply) {
      writeFileSync(file, config.replace(/(\[auth\.external\.google\]\s*\nenabled = )(true|false)/, "$1true"));
      for (const action of ["stop", "start"]) {
        const result = spawnSync(process.execPath, [path.join(root, "scripts/development-db.mjs"), action], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
        if (result.error || result.status !== 0) throw new Error("Could not restart development Auth; check the local Docker services.");
      }
      const base = parseEnv(readFileSync(path.join(root, ".env.development.local"), "utf8"));
      const settings = await jsonRequest(`${base.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: base.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } });
      if (!settings.external?.google) throw new Error("Development Google provider is not active after restart.");
      enableButton(path.join(root, ".env.development.local"));
      console.log("Development Google provider verified. Restart the app; browser consent still needs an interactive smoke test.");
    }
  } else {
    const base = parseEnv(readFileSync(path.join(root, ".env.staging.local"), "utf8"));
    const projectUrl = new URL(base.NEXT_PUBLIC_SUPABASE_URL);
    const projectRef = projectUrl.hostname.split(".")[0];
    if (!/^[a-z]{20}$/.test(projectRef) || !projectUrl.hostname.endsWith(".supabase.co")) throw new Error("Staging must use a hosted Supabase project.");
    const token = required("SUPABASE_ACCESS_TOKEN");
    const siteUrl = new URL(required("GOOGLE_AUTH_SITE_URL"));
    const redirects = [...new Set(required("GOOGLE_AUTH_REDIRECT_URLS").split(",").map((url) => url.trim()).filter(Boolean))];
    for (const raw of [siteUrl.href, ...redirects]) {
      const url = new URL(raw);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Use HTTPS for hosted Auth URLs, or HTTP for localhost only.");
      if (url.username || url.password || url.hash || url.search || raw.includes("*")) throw new Error("Use exact Auth URLs without credentials, query strings or wildcards.");
    }
    if (!redirects.includes(`${siteUrl.origin}/auth/callback`)) throw new Error("Include the selected site's /auth/callback in GOOGLE_AUTH_REDIRECT_URLS.");
    console.log(`Google authorized redirect URI: ${projectUrl.origin}/auth/v1/callback`);
    console.log(`App Site URL: ${siteUrl.origin}; callback allowlist: ${redirects.join(",")}`);
    if (apply) {
      const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      // Verify permissions before making the change; retain a private recovery copy.
      const before = await jsonRequest(endpoint, { headers });
      const backup = path.join(root, ".env.google-auth-before.local");
      writeFileSync(backup, JSON.stringify(before, null, 2) + "\n", { mode: 0o600 });
      await jsonRequest(endpoint, {
        method: "PATCH", headers,
        body: JSON.stringify({
          external_google_enabled: true,
          external_google_client_id: clientId,
          external_google_secret: secret,
          external_google_skip_nonce_check: false,
          site_url: siteUrl.origin,
          uri_allow_list: redirects.join(","),
        }),
      });
      const after = await jsonRequest(endpoint, { headers });
      if (!after.external_google_enabled || after.external_google_client_id !== clientId || new URL(after.site_url).origin !== siteUrl.origin) throw new Error("Google provider settings did not match after update.");
      const configuredRedirects = (after.uri_allow_list || "").split(",").map((url) => url.trim());
      if (redirects.some((url) => !configuredRedirects.includes(url))) throw new Error("Auth callback allowlist did not match after update.");
      const settings = await jsonRequest(`${projectUrl.origin}/auth/v1/settings`, { headers: { apikey: base.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } });
      if (!settings.external?.google) throw new Error("Google provider is not yet active; retry verification after propagation.");
      enableButton(path.join(root, ".env.staging.local"));
      console.log("Staging Google provider and callback settings verified. Restart or rebuild the app; browser consent still needs an interactive smoke test.");
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
