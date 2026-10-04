import { afterEach, describe, expect, it, vi } from "vitest";
import { requireVpsUploadUrl, uploadVpsFile } from "@/lib/vps-storage-upload";

const url = `/vps-storage/signed-upload/teacher-documents/development/notes.pdf?expires=2000000000&signature=${"a".repeat(64)}`;

afterEach(() => vi.unstubAllGlobals());

describe("VPS browser uploads", () => {
  it("uploads through the VPS proxy with the signed query and content type", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetcher);
    const file = new Blob(["%PDF"], { type: "application/pdf" });
    await uploadVpsFile(url, file, "application/pdf");
    expect(fetcher).toHaveBeenCalledWith(url, {
      method: "PUT", headers: { "Content-Type": "application/pdf", "x-upsert": "false" }, body: file,
    });
  });

  it.each([
    "", "https://example.supabase.co/storage/v1/upload/sign/bucket/file",
    "https://other.example/vps-storage/signed-upload/bucket/file",
    "//other.example/vps-storage/signed-upload/bucket/file",
    "/vps-storage/signed-upload/../../storage/v1/object/file",
    "/vps-storage/signed-upload/bucket/file?expires=2000000000",
  ])("refuses an unprepared or non-VPS destination without sending a request: %s", async (destination) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(uploadVpsFile(destination, new Blob(["bytes"]), "application/pdf")).rejects.toThrow("could not be prepared");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports a failed VPS upload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(uploadVpsFile(url, new Blob(["bytes"]), "application/pdf")).rejects.toThrow("could not be uploaded");
    expect(requireVpsUploadUrl(url)).toBe(url);
  });
});
