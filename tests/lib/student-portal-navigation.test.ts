import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShell = readFileSync("components/app-shell.tsx", "utf8");
const appLayout = readFileSync("app/app/layout.tsx", "utf8");
const appSidebar = readFileSync("components/app-sidebar.tsx", "utf8");

describe("student portal navigation chrome", () => {
  it("uses a shared student-portal title as the layout fallback", () => {
    expect(appLayout).toContain('<AppShell user={user} title="Dashboard">');
  });

  it("has no top bar: every page prints its own heading", () => {
    // The bar repeated each page's title — every tab said its name twice.
    expect(appShell).not.toContain("truncate text-center font-sans text-sm font-medium");
    expect(appShell).not.toContain("{dynamicTitle ?? title}");
    expect(appShell).not.toContain("<ThemeToggle");
    expect(appShell).not.toContain("topbarSuppressed");
  });

  it("keeps a way to open the sidebar on a phone, and only on a phone", () => {
    expect(appShell).toMatch(/className="flex h-12 shrink-0 items-center border-b border-border px-3 md:hidden"/);
    expect(appShell).toContain('aria-label="Open sidebar"');
  });

  it("keeps the theme toggle, in the sidebar's profile row", () => {
    expect(appSidebar).toContain('import { ThemeToggle } from "@/components/theme-toggle";');
    expect(appSidebar).toContain('<ThemeToggle className="h-10 w-10 shrink-0 bg-bg-primary" />');
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
