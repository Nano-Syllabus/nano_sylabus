function assertSupabaseDatabaseEnvironment(url: string) {
  const environment = process.env.NEXT_PUBLIC_APP_ENV;
  if (environment !== "development" && environment !== "staging") return;

  const development = process.env.NEXT_PUBLIC_DEVELOPMENT_SUPABASE_URL;
  const staging = process.env.NEXT_PUBLIC_STAGING_SUPABASE_URL;
  if (!development || !staging) {
    throw new Error("Set separate development and staging Supabase URLs before starting the app.");
  }
  const developmentOrigin = new URL(development).origin;
  const stagingOrigin = new URL(staging).origin;
  if (developmentOrigin === stagingOrigin) {
    throw new Error("Development and staging must use different Supabase databases.");
  }
  const expectedOrigin = environment === "development" ? developmentOrigin : stagingOrigin;
  if (new URL(url).origin !== expectedOrigin) {
    throw new Error(`The Supabase URL does not match the selected ${environment} environment.`);
  }
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  assertSupabaseDatabaseEnvironment(url);
  return { url, key };
}

export function getSupabaseServiceRoleEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  assertSupabaseDatabaseEnvironment(url);
  return { url, serviceRoleKey };
}

export function getTenantApiEnv() {
  const baseUrl = process.env.TENANT_API_BASE_URL;
  const token = process.env.TENANT_API_TOKEN;
  const rejectUnauthorized = (process.env.TENANT_API_REJECT_UNAUTHORIZED || "0").trim() === "1";
  const timeoutMs = Number(process.env.TENANT_API_TIMEOUT_MS || 30000);

  if (!baseUrl || !token) {
    throw new Error(
      "Missing tenant API environment variables. Set TENANT_API_BASE_URL and TENANT_API_TOKEN.",
    );
  }

  return {
    baseUrl,
    token,
    rejectUnauthorized,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.max(timeoutMs, 30000) : 30000,
  };
}
