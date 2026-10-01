import { expect, it, vi } from "vitest";
vi.mock("@/lib/data/teacher-drive-queue", () => ({}));
vi.mock("@/lib/teacher-app/client", () => ({}));
import { indexingOutcome } from "@/lib/teacher-index-reconcile";

it("does not mistake queue acceptance or an empty index for completion", () => {
  expect(indexingOutcome({ status: "queued", chunks_indexed: 0 })).toBe("indexing");
  expect(indexingOutcome({ status: "processing", chunks_indexed: 0 })).toBe("indexing");
  expect(indexingOutcome({ status: "retry_wait", chunks_indexed: 0 })).toBe("indexing");
  expect(indexingOutcome({ status: "done", chunks_indexed: 0 })).toBe("failed");
  expect(indexingOutcome({ status: "indexed", chunks_indexed: 5 })).toBe("done");
  expect(indexingOutcome({ status: "expired" })).toBe("expired");
});
