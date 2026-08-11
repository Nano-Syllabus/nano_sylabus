import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the live dev compiler isolated from production builds. Running
  // `next build` while `next dev` is active otherwise replaces its CSS and
  // chunk manifests, leaving the browser with unstyled HTML until restart.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
