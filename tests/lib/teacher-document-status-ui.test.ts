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
 * What a shelf says about a file it cannot search yet.
 *
 * The tenant API reports a file that was stored but never indexed exactly as it
 * reports one whose indexing job is still queued — `indexed: false`,
 * `chunk_count: 0`, `status: ""`. The portal used to call both of them
 * "Indexing", so a creator whose syllabus never indexed was told to wait for
 * something that was never going to happen.
 */

type Props = ComponentProps<typeof DocumentList>;
type Document = Props["documents"][number];

function document(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc_1",
    name: "organization-and-management-syllabus.txt",
    path: "Organization and Management/Syllabus/organization-and-management-syllabus.txt",
    shelf: "Syllabus",
    sizeBytes: 2048,
    status: "unindexed",
    chunks: 0,
    previewAvailable: true,
    ...overrides,
  };
}

function render(overrides: Partial<Document> = {}, indexingNames = new Set<string>()) {
  return renderToStaticMarkup(
    createElement(DocumentList, {
      documents: [document(overrides)],
      emptyTitle: "No syllabus file yet",
      onUpload: () => {},
      onOpen: () => {},
      onIndex: async () => {},
      indexingNames,
    }),
  );
}

describe("a document card's indexing state", () => {
  it("calls a file that was never indexed what it is, and offers to index it", () => {
    const html = render();

    expect(html).toContain("Not indexed");
    expect(html).not.toContain("Indexing");
    expect(html).toContain("Index now");
    // "0 indexed sections" is not the news about a file that was never indexed.
    expect(html).not.toContain("0 indexed sections");
  });

  it("says Indexed, not Ready, once the sections exist", () => {
    const html = render({ status: "ready", chunks: 12 });

    expect(html).toContain("Indexed");
    expect(html).toContain("12 indexed sections");
    expect(html).not.toContain("Index now");
    expect(html).not.toContain("Retry indexing");
  });

  it("offers a retry when indexing finished badly", () => {
    const html = render({ status: "error" });

    expect(html).toContain("Needs attention");
    expect(html).toContain("Retry indexing");
  });

  it("still says Indexing while this session is watching a job for the file", () => {
    const html = render({}, new Set(["organization-and-management-syllabus.txt"]));

    expect(html).toContain("Indexing");
    expect(html).not.toContain("Not indexed");
    // Nothing to retry: the work is genuinely under way.
    expect(html).not.toContain("Index now");
  });
});
