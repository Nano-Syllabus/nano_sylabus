import type { User } from "@supabase/supabase-js";

/**
 * Development-only auth bypass, so UI work does not need a login round trip.
 *
 * Every screen worth optimizing sits behind the auth gate, which makes the
 * simple loop — change a component, reload, look at it — cost a sign-in each
 * time. With this on, the app treats an anonymous local request as a signed-in
 * student, so `/app/*` and the API routes render exactly as they would for a
 * real user.
 *
 * Three independent conditions all have to hold, so no single mistake can turn
 * it on where it would matter:
 *
 * - The build must not be a production build. `next build` fixes NODE_ENV to
 *   "production", so anything you actually ship has this compiled out.
 * - It must not be running on Vercel. `process.env.VERCEL` is set on every
 *   deployment including previews, so a stray value in the dashboard is inert.
 * - `DEV_AUTH_BYPASS=1` has to be set explicitly. It is absent from
 *   `.env.example`, and it has no `NEXT_PUBLIC_` prefix, so nothing reaching
 *   the browser can set or read it.
 *
 * On top of that it only ever fabricates a session when there is genuinely no
 * real one, so it can never downgrade or impersonate a signed-in user.
 *
 * The consequence worth knowing: because it is off in production builds, it
 * cannot be used to profile `next build && next start`. Measure that with a
 * real account through `scripts/perf/audit.mjs` instead.
 *
 * `DEV_AUTH_BYPASS_USER_ID` picks whose data the screens render. Point it at a
 * real account to profile realistic DOM sizes; leave it unset and the queries
 * come back empty, which is the right way to check empty states.
 */
const PRODUCTION_BUILD = process.env.NODE_ENV === "production";
const DEPLOYED = Boolean(process.env.VERCEL);

export const DEV_AUTH_BYPASS =
  !PRODUCTION_BUILD && !DEPLOYED && process.env.DEV_AUTH_BYPASS === "1";

/** All-zero UUID: shaped like a real id, matches no row. */
const EMPTY_STATE_USER_ID = "00000000-0000-0000-0000-000000000000";

export const DEV_BYPASS_USER_ID =
  process.env.DEV_AUTH_BYPASS_USER_ID?.trim() || EMPTY_STATE_USER_ID;

let warned = false;

export function devBypassUser(): User {
  if (!warned) {
    warned = true;
    console.warn(
      `\n  ⚠  DEV_AUTH_BYPASS is on — every request is treated as signed in as ` +
        `${DEV_BYPASS_USER_ID}.\n     This is refused on Vercel. Never set it anywhere that serves real users.\n`,
    );
  }

  return {
    id: DEV_BYPASS_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "dev-bypass@localhost",
    app_metadata: {},
    user_metadata: { full_name: "Dev Bypass" },
    is_anonymous: false,
    created_at: "",
  } as User;
}
