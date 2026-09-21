import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/teachers",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { DocumentList } from "@/app/teachers-v2/views/subject-view";

/**
 * Renaming a file from its card in the creator workspace — the same screen the
 * sidebar calls "Student Ambassador".
 *
 * A rename changes what a file is called and nothing else, so the card offers it
 * on every file whatever its indexing state, and the workspace patches the one
 * name it changed instead of reloading everything it already has.
 */

type Props = ComponentProps<typeof DocumentList>;
type Document = Props["documents"][number];

function document(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc_1",
    name: "unit-1.pdf",
    path: "Physics/Notes/unit-1.pdf",
    shelf: "Notes",
    sizeBytes: 2048,
    status: "ready",
    chunks: 12,
    previewAvailable: true,
    ...overrides,
  };
}

function render(props: Partial<Props> = {}, overrides: Partial<Document> = {}) {
  return renderToStaticMarkup(
    createElement(DocumentList, {
      documents: [document(overrides)],
      emptyTitle: "No study material yet",
      onUpload: () => {},
      onOpen: () => {},
      onIndex: async () => {},
      indexingNames: new Set<string>(),
      ...props,
    }),
  );
}

describe("renaming a file from its card", () => {
  it("offers a rename, named for the file it renames", () => {
    const html = render({ onRename: async () => {} });

    expect(html).toContain('aria-label="Rename unit-1.pdf"');
    expect(html).toContain(">Rename</button>");
    // Still the file's name as a heading, not only inside the control.
    expect(html).toMatch(/<h2[^>]*>unit-1\.pdf<\/h2>/);
  });

  it.each(["ready", "unindexed", "processing", "error"] as const)(
    "offers it whatever the indexing state (%s)",
    (status) => {
      expect(render({ onRename: async () => {} }, { status })).toContain("Rename unit-1.pdf");
    },
  );

  it("is not offered where the list has no way to rename", () => {
    expect(render()).not.toContain("Rename");
  });
});

describe("the workspace's rename handler", () => {
  const source = readFileSync(
    path.join(process.cwd(), "app/teachers-v2/teacher-workspace-v2.tsx"),
    "utf8",
  );
  const start = source.indexOf("const renameDocument = useCallback(");
  const handler = source.slice(start, source.indexOf("}, []);", start));

  it("exists and is handed to the subject view", () => {
    expect(start).toBeGreaterThan(-1);
    expect(source).toContain("onRenameDocument={renameDocument}");
  });

  it("patches the name it changed rather than reloading the workspace", () => {
    expect(handler).toContain("withRenamedDocument(");
    expect(handler).not.toMatch(
      /loadWorkspace\(|loadDashboard\(|router\.refresh|invalidateQueries/,
    );
  });

  it("puts the old name back when the rename is refused", () => {
    expect(handler).toMatch(/catch \(error\) \{\s*show\(name, document\.name\);\s*throw error;/);
  });
});
