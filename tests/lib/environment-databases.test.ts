import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnv, getSupabaseServiceRoleEnv } from "@/lib/env";

const development = "http://127.0.0.1:54321";
const staging = "https://staging-project.supabase.co";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEVELOPMENT_SUPABASE_URL", development);
  vi.stubEnv("NEXT_PUBLIC_STAGING_SUPABASE_URL", staging);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-server-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("development and staging database selection", () => {
  it.each([["development", development], ["staging", staging]])("accepts the selected %s database", (environment, url) => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", environment);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    expect(getSupabaseEnv().url).toBe(url);
    expect(getSupabaseServiceRoleEnv().url).toBe(url);
  });

  it.each([["development", staging], ["staging", development]])("blocks %s using the other database for both public and admin clients", (environment, url) => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", environment);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    expect(getSupabaseEnv).toThrow("does not match");
    expect(getSupabaseServiceRoleEnv).toThrow("does not match");
  });

  it("rejects the same database even when one URL has a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", staging);
    vi.stubEnv("NEXT_PUBLIC_DEVELOPMENT_SUPABASE_URL", staging + "/");
    expect(getSupabaseEnv).toThrow("must use different");
  });

  it("requires the database separation configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", development);
    vi.stubEnv("NEXT_PUBLIC_STAGING_SUPABASE_URL", "");
    expect(getSupabaseEnv).toThrow("Set separate");
  });
});
