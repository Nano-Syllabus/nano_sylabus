import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/notes",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { RevisionDocsSkeleton } from "@/components/revision-docs-client";

/**
 * Revision loads as what it is: a tree down the left and one document.
 *
 * Its route skeleton was the generic notes grid — nine cards — so a first visit
 * drew a different page and then swapped it for the docs. It is now built from
 * the page's own pieces.
 */
const source = readFileSync("components/revision-docs-client.tsx", "utf8");

describe("the revision skeleton", () => {
  const html = renderToStaticMarkup(createElement(RevisionDocsSkeleton));

  it("draws the tree's real chrome: search on top, the corpus links at the foot", () => {
    expect(html).toContain('placeholder="Search topics"');
    expect(html).toContain("My saved notes");
    expect(html).toContain("Flashcards from your notes");
  });

  it("draws the document's real headings, with only the words pulsing", () => {
    expect(html).toContain(">Concepts</h2>");
    expect(html).toContain(">Past questions on this topic</h2>");
    expect(html).toContain("animate-pulse bg-border");
    expect(html).toContain('aria-busy="true"');
  });

  it("is built from the same pieces as the page", () => {
    // The tree frame and the layout classes are used by BOTH the page and the
    // skeleton, so neither can be redesigned without the other.
    for (const piece of ["<TreeFrame", "docsRootClass", "docsAsideClass", "docsMainClass", "docsItemCardClass"]) {
      const uses = source.split(piece).length - 1;
      expect(uses, `${piece} should appear in the page and the skeleton`).toBeGreaterThanOrEqual(2);
    }
  });

  it("is what both docs routes load, and the note-card routes keep their grid", () => {
    for (const route of ["app/app/notes/loading.tsx", "app/app/notes/revision/loading.tsx"]) {
      expect(readFileSync(route, "utf8")).toContain("<RevisionDocsSkeleton />");
    }
    expect(readFileSync("app/app/notes/saved/loading.tsx", "utf8")).toContain('variant="notes"');
  });
});
