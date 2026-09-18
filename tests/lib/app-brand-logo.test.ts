import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const logoConsumers = [
  "components/marketing-nav.tsx",
  "components/landing-header.tsx",
  "components/app-sidebar.tsx",
  "components/mobile-receipt-upload.tsx",
  "components/admin-analytics-dashboard.tsx",
  "components/admin-billing-frame.tsx",
  "components/saas-flow-client.tsx",
  "components/community-catalog-client.tsx",
  "public/nanoenjoy-teacher.html",
  "app/teachers-v2/teacher-workspace-v2.tsx",
  "app/teachers/teacher-workspace.tsx",
  "app/communities/invite/[token]/page.tsx",
  "app/r/[code]/page.tsx",
];

describe("app brand logo", () => {
  it("serves the provided nanologo asset", () => {
    expect(existsSync("public/nanologo.png")).toBe(true);
  });

  it("uses the same logo source everywhere the app renders the brand mark", () => {
    for (const file of logoConsumers) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("/nanologo.png");
      expect(source, file).not.toContain("/nano_logo.png");
    }
  });
});
