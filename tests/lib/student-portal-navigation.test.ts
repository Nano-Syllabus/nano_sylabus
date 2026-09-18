import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShell = readFileSync("components/app-shell.tsx", "utf8");
const appLayout = readFileSync("app/app/layout.tsx", "utf8");
const appSidebar = readFileSync("components/app-sidebar.tsx", "utf8");

describe("student portal navigation chrome", () => {
  it("uses a shared student-portal title as the layout fallback", () => {
    expect(appLayout).toContain('<AppShell user={user} title="Dashboard">');
  });

  it("keeps the shared top bar visible, aligned, and theme-aware", () => {
    expect(appShell).toContain('import { ThemeToggle } from "@/components/theme-toggle";');
    expect(appShell).toContain('min-h-[53px] shrink-0 items-center justify-between');
    expect(appShell).toContain('border-b border-border bg-bg-secondary');
    expect(appShell).toContain('<ThemeToggle className="h-10 w-10 shrink-0 bg-bg-primary" />');
    expect(appShell).not.toContain("topbarSuppressed");
  });

  it("aligns the sidebar brand row to the shared top bar", () => {
    expect(appSidebar).toContain('mb-3 flex items-center pt-[18px]');
  });

  it("uses one compact selected-tab treatment throughout primary navigation", () => {
    expect(appSidebar).toContain('text-sidebar-crisp gap-3 rounded-[9px] px-[11px] py-2');
    expect(appSidebar).toContain('bg-text-primary text-text-inverse');
    expect(appSidebar).toContain('flex min-h-10 items-center text-sm leading-5');
  });

  it("removes the learning profile menu item and labels the ambassador entry", () => {
    expect(appSidebar).not.toContain("Learning profile");
    expect(appSidebar).toContain("Student Ambassador");
    expect(appSidebar).toContain('href="/teachers"');
  });
});
