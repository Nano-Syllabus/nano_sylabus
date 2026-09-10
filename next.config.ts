import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the live dev compiler isolated from production builds. Running
  // `next build` while `next dev` is active otherwise replaces its CSS and
  // chunk manifests, leaving the browser with unstyled HTML until restart.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // "X-Powered-By: Next.js" tells an attacker which stack to target and buys
  // nothing in return.
  poweredByHeader: false,

  /**
   * Security response headers.
   *
   * Vercel already sends HSTS; everything below was absent. These are the
   * directives that cannot break a working page — none of them constrain where
   * scripts load from, so nothing here can stop the app running:
   *
   * - `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` stop the app
   *   being framed by another site for clickjacking. Deliberately not DENY:
   *   `/teachers` renders the creator portal from `public/` in a same-origin
   *   iframe, and DENY would blank it.
   * - `base-uri 'self'` stops an injected `<base>` tag redirecting every
   *   relative URL on the page to an attacker's host.
   * - `object-src 'none'` removes the plugin embedding surface. The PDF and
   *   material viewers use iframes, not `<object>`.
   * - `form-action 'self'` keeps a form from posting somewhere else. Every form
   *   here submits through JavaScript to this origin.
   * - `COOP: same-origin-allow-popups` severs an opener's handle on this
   *   window while leaving OAuth popups working.
   *
   * A `script-src` policy is the missing piece and is deliberately not here: it
   * needs per-request nonces through middleware, so it wants its own rollout
   * rather than being bolted onto a config change.
   *
   * The OTHER thing that blocked it is gone. This used to say the TikZ renderer
   * pulled from unpkg.com at runtime — TikZJax, a WASM TeX distribution fetched
   * per reader to compile figures in the browser. Figures are drawn on the
   * server now and arrive as images, so nothing on any page loads a script from
   * a third-party origin, and `script-src 'self'` is reachable.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },

  /**
   * DEVELOPMENT INSTRUMENTS THAT MUST NEVER REACH A USER'S BROWSER.
   *
   * Both of these are client components, so importing them in a layout puts
   * them in that layout's client chunk whatever the render-time condition says
   * — a constant that folds to `false` removes the RENDER, not the MODULE.
   * Nor is a dynamic `import()` behind such a check enough: that still emits
   * the chunk, it just never fetches it, so the bytes are still built and
   * deployed. Swapping in a no-op stub at build time is what makes the
   * exclusion structural.
   *
   * - `dev-perf-hud` is the render-timing overlay.
   * - `query-devtools` is the TanStack Query cache inspector, which is ~40 KB
   *   on its own and is the thing you open to check that this app's caching is
   *   behaving — invaluable in `next dev`, pure weight in production.
   *
   * `NEXT_PUBLIC_PERF_HUD=1` keeps the HUD, for deliberately profiling a
   * production build. The query devtools have no such escape hatch on purpose:
   * `next dev` is where you inspect a cache, and a production build with a
   * cache inspector attached is a production build somebody forgot to revert.
   */
  webpack(config, { dev }) {
    const stubs: Array<[string, string]> = [];

    if (!dev && process.env.NEXT_PUBLIC_PERF_HUD !== "1") {
      stubs.push(["components/dev-perf-hud.tsx", "components/dev-perf-hud.stub.tsx"]);
    }
    if (!dev) {
      stubs.push(["components/query-devtools.tsx", "components/query-devtools.stub.tsx"]);
    }

    if (stubs.length) {
      config.resolve.alias = {
        ...config.resolve.alias,
        ...Object.fromEntries(
          stubs.map(([real, stub]) => [path.resolve(real), path.resolve(stub)]),
        ),
      };
    }
    return config;
  },

  /**
   * Turbopack is what `npm run dev` uses, and this block is why it is quiet
   * about it.
   *
   * Turbopack does not read the `webpack()` function above, and Next warns
   * loudly when one is configured and the other is not — "Webpack is
   * configured while Turbopack is not, which may cause problems." Here that
   * warning is a false alarm and worth silencing rather than living with,
   * because a warning that is always wrong trains you to ignore the one that
   * is not: everything `webpack()` does is inside `if (!dev)`, and `next build`
   * still runs on webpack. There is nothing for Turbopack to mirror.
   *
   * Declaring the key at all is what tells Next the omission was a decision.
   *
   * WHY TURBOPACK IS THE DEFAULT FOR DEV. Cold start went from tens of seconds
   * to about two, and a change to one route recompiles that route rather than
   * the graph around it. On a codebase with ~200 route files and a 1400-line
   * chat client, that is the difference between editing and waiting. Anything
   * that misbehaves under it has `npm run dev:webpack` — same app, same port,
   * its own dist directory so the two never overwrite each other's manifests.
   */
  turbopack: {
    /**
     * Where the project starts, stated rather than inferred.
     *
     * Turbopack walks up from the config file looking for a lockfile to decide
     * what to watch, and this checkout sits inside a directory that has its own
     * `node_modules` beside two sibling repos — so inference can land a level
     * too high and put three projects into one file-watch graph. Naming it is
     * also what makes this block non-empty, which is what actually silences the
     * "Webpack is configured while Turbopack is not" warning: Next tests for a
     * turbopack key with a VALUE, so `turbopack: {}` reads as no config at all.
     */
    root: path.resolve("."),
  },

  experimental: {
    // Pull only the icons each file actually names instead of walking the whole
    // lucide barrel file, which is the difference between compiling a handful
    // of modules and a couple of thousand on every page that shows an icon.
    optimizePackageImports: ["lucide-react"],

    /**
     * PAGE-TO-PAGE CACHING, WHICH NEXT 15 SHIPS TURNED OFF.
     *
     * The client Router Cache holds the RSC payload of a route you have already
     * visited, so going back to it is an in-memory read rather than a request.
     * In Next 15 `dynamic` defaults to **0**, which disables it outright for
     * every dynamic route — and every `/app` tab here is `force-dynamic`, so
     * moving Today -> Chat -> Today refetched Today from the server both times.
     * On a phone on Nepali mobile data that is the whole feel of the app.
     *
     * WHY THIS IS A SESSION, NOT A TIMER.
     *
     * This was 30s, on the reasoning that a per-user study surface should not
     * show a stale credit balance for longer than that. That reasoning is
     * obsolete: a stale value is now prevented by the write that changed it,
     * not by a countdown. Every write patches the client cache in place, and
     * anything RSC-rendered calls `router.refresh()`, which busts this cache
     * regardless of the window. A timer only ever expired on a student who had
     * changed nothing — so all 30s bought was a shimmer on the way back to a
     * tab whose contents were already correct.
     *
     * At an hour, the Router Cache holds the full RSC payload of every tab
     * visited this page load. First visit renders and shows `loading.tsx`;
     * every return is an in-memory read with no request and no shimmer. The
     * cache is per-page-load and dies on reload, which is exactly where fresh
     * data is supposed to come from.
     *
     * `static: 180` covers the marketing and public-catalog routes, where the
     * content genuinely does not change minute to minute.
     */
    staleTimes: {
      dynamic: 3600,
      static: 180,
    },
  },
};

export default nextConfig;
