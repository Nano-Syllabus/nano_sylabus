import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the live dev compiler isolated from production builds. Running
  // `next build` while `next dev` is active otherwise replaces its CSS and
  // chunk manifests, leaving the browser with unstyled HTML until restart.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  experimental: {
    // Pull only the icons each file actually names instead of walking the whole
    // lucide barrel file, which is the difference between compiling a handful
    // of modules and a couple of thousand on every page that shows an icon.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
