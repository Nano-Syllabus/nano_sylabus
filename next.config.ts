import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the live dev compiler isolated from production builds. Running
  // `next build` while `next dev` is active otherwise replaces its CSS and
  // chunk manifests, leaving the browser with unstyled HTML until restart.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  /**
   * The development performance HUD must never reach a user's browser. It is a
   * client component, so importing it in the root layout puts it in that
   * layout's client chunk whatever the render-time condition says — a constant
   * that folds to `false` removes the render, not the module. Swapping in a
   * no-op stub at build time makes the exclusion structural.
   *
   * `NEXT_PUBLIC_PERF_HUD=1` keeps the real thing, for deliberately profiling a
   * production build.
   */
  webpack(config, { dev }) {
    if (!dev && process.env.NEXT_PUBLIC_PERF_HUD !== "1") {
      config.resolve.alias = {
        ...config.resolve.alias,
        [path.resolve("components/dev-perf-hud.tsx")]: path.resolve(
          "components/dev-perf-hud.stub.tsx",
        ),
      };
    }
    return config;
  },

  experimental: {
    // Pull only the icons each file actually names instead of walking the whole
    // lucide barrel file, which is the difference between compiling a handful
    // of modules and a couple of thousand on every page that shows an icon.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
