import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next preserves JSX for its own compiler; component tests need it transformed.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
