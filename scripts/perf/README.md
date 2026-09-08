# Performance tooling

Three separate things live here, because "the app feels slow" has three
different causes and they need different instruments.

| Tool | Answers | Needs login? |
| --- | --- | --- |
| `npm run perf:audit` | End-to-end: TTFB, route-change cost, Lighthouse | Yes |
| `npm run perf:ui` | Browser-side only: JS execution, hydration, DOM, scroll | No, in dev |
| `npm run perf:security` | HTTP response headers, and optionally TLS | No |
| `components/dev-perf-hud.tsx` | Live numbers while you click around | No, in dev |

## Working on the UI without logging in

Every `/app` screen is behind the auth gate, which makes the ordinary loop —
change a component, reload, look at it — cost a sign-in each time. Set this in
`.env.local` and it stops asking:

```bash
DEV_AUTH_BYPASS=1
# Optional: whose data the screens render. Unset renders empty states.
DEV_AUTH_BYPASS_USER_ID=<a real auth.users id>
```

Then `npm run dev:nologin`, and `/app/*` plus the API routes answer as a
signed-in student with unlimited credits.

Three independent conditions all have to hold for it to switch on: a
non-production build, a non-Vercel host, and that explicit env var. `next build`
pins `NODE_ENV=production`, so anything you ship has it compiled out; the flag
has no `NEXT_PUBLIC_` prefix, so nothing in the browser can reach it. See
`lib/dev-auth-bypass.ts`.

Two consequences worth knowing:

- Row level security does not know about the fake user, so a bypassed request
  talks to the database with the service role. A real local login is untouched
  and keeps its own RLS boundaries.
- Because it is off in production builds, it cannot profile `next build && next
  start`. Use a real account there — see below.

## End-to-end audit

Measure a production build. `next dev` numbers are dominated by on-demand
compilation and say nothing about what ships.

```bash
npm run build && npm start

npm run perf:audit -- --label=baseline
# ...change things, rebuild, restart...
npm run perf:audit -- --label=after
npm run perf:compare baseline after
```

Gated routes need an account in `.env.local`:

```bash
PERF_TEST_EMAIL=...
PERF_TEST_PASSWORD=...
```

`node scripts/perf/seed-test-user.mjs` creates a disposable one and writes those
two lines for you; `--delete` removes it again. Everything user-owned cascades
from `auth.users`, so deleting the account takes its whole footprint with it.

Flags: `--mode=desktop`, `--only=today,chat`, `--runs=7`, `--base=https://…`,
`--lighthouse=false`.

## UI-only profile

Ignores the server entirely and looks at what the browser does: bundle
evaluation, React hydration, DOM size, style and layout cost, and frame pacing
while scrolling. CPU is throttled 4× so main-thread cost shows up the way it
would on a mid-range phone.

```bash
npm run perf:ui -- --label=before
npm run perf:ui -- --label=after
npm run perf:ui -- --compare=before,after
```

Against `next dev` it uses the bypass and needs no credentials. Against a
production build it signs in with `PERF_TEST_*` if they are set. Flags:
`--base=`, `--only=`, `--runs=`, `--cpu=` (throttle multiplier).

**Read dev numbers with care.** Development bundles are unminified — 15 MB of
JS versus roughly 1 MB in production — so dev is for spotting a change you just
made, not for absolute figures. Quote production-build numbers.

## Live HUD

`components/dev-perf-hud.tsx` draws a small readout in the corner: TTFB, FCP,
LCP, INP, CLS, hydration, the last route change, and the slowest recent
requests. `ctrl+alt+P` expands or collapses it, `ctrl+alt+H` hides it.

`next.config.ts` aliases the module to a no-op stub in production builds, so
none of its code reaches a user's browser. Set `NEXT_PUBLIC_PERF_HUD=1` to keep
the real one when deliberately profiling a production build.

## Results

Runs land in `perf-results/` (gitignored) as JSON, named `<label>-<mode>.json`
for audits and `ui-<label>.json` for UI profiles.

## HTTP and TLS audit

```bash
npm run perf:security -- --url=https://nano-sylabus-ten.vercel.app
npm run perf:security -- --url=https://nano-sylabus-ten.vercel.app --all
```

Without flags it only reads the site's own response headers and grades them
here — no third party, and it works against `http://localhost:3000` too, so a
header change can be checked before it ships. The grade mirrors what
securityheaders.com scores: one step down per missing header from CSP, HSTS,
X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy.

`--all` adds the two external services, which do send the hostname to a third
party:

- **securityheaders.com** for an independent grade. It answers a plain `fetch`
  with HTTP 403, so this drives a real browser for one page load.
- **SSL Labs** for the TLS configuration — protocols, ciphers, chain. Queried
  with `publish=off` so the result is not added to their public listings. A cold
  scan takes several minutes.

The headers themselves are set in `next.config.ts`. `script-src` is deliberately
not among them: it needs per-request nonces through middleware, and the TikZ
renderer pulls from unpkg.com at runtime, so it needs its own rollout.
