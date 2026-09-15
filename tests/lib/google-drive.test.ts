import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadDriveFile,
  driveContentType,
  driveFileName,
  DriveLinkError,
  parseDriveLink,
  resolveDriveLink,
} from "@/lib/google-drive";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bytesResponse(bytes: number, contentType = "application/pdf") {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

describe("parseDriveLink", () => {
  it("reads the id out of the shapes teachers actually paste", () => {
    // An editor link also reports the native type behind it: with no API key
    // that path segment is the ONLY thing that says a Doc is a Doc.
    const cases: Array<[string, string, "file" | "folder", string?]> = [
      ["https://drive.google.com/file/d/1AbC_dEfG-hIjK/view?usp=sharing", "1AbC_dEfG-hIjK", "file"],
      ["https://drive.google.com/open?id=1AbC_dEfG-hIjK", "1AbC_dEfG-hIjK", "file"],
      [
        "https://drive.google.com/drive/folders/1FolderIdHere?usp=drive_link",
        "1FolderIdHere",
        "folder",
      ],
      ["https://drive.google.com/drive/u/0/folders/1FolderIdHere", "1FolderIdHere", "folder"],
      [
        "https://docs.google.com/document/d/1DocIdHere/edit#heading=h.x",
        "1DocIdHere",
        "file",
        "application/vnd.google-apps.document",
      ],
      [
        "https://docs.google.com/spreadsheets/d/1SheetId/edit?gid=0",
        "1SheetId",
        "file",
        "application/vnd.google-apps.spreadsheet",
      ],
      [
        "https://docs.google.com/presentation/d/1SlidesId/edit",
        "1SlidesId",
        "file",
        "application/vnd.google-apps.presentation",
      ],
      ["https://drive.usercontent.google.com/download?id=1DirectId", "1DirectId", "file"],
      ["drive.google.com/file/d/1NoSchemeId/view", "1NoSchemeId", "file"],
    ];
    for (const [link, id, kind, docsMime] of cases) {
      expect(parseDriveLink(link), link).toEqual(docsMime ? { id, kind, docsMime } : { id, kind });
    }
  });

  it("accepts a bare id, which the share dialog does not produce but people paste", () => {
    expect(parseDriveLink("1BvC_dEfGhIjKlMnOpQrStUv")).toEqual({
      id: "1BvC_dEfGhIjKlMnOpQrStUv",
      kind: "file",
    });
  });

  /**
   * The guard that matters. Every request this module makes is built from the id
   * against a hard-coded Google host, and a host that merely *contains* a Google
   * domain must never get that far — otherwise a creator account turns this
   * server into a probe for hosts only it can reach.
   */
  it("refuses hosts that only look like Google", () => {
    const hostile = [
      "https://docs.google.com.evil.test/document/d/1Id/edit",
      "https://drive.google.com.attacker.example/file/d/1Id/view",
      "https://evil.test/file/d/1Id/view",
      "http://169.254.169.254/latest/meta-data/",
      "https://notdrive.google.com/file/d/1Id/view",
      "file:///etc/passwd",
      "",
      "not a link at all",
    ];
    for (const link of hostile) {
      expect(parseDriveLink(link), link).toBeNull();
    }
  });
});

describe("resolveDriveLink", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("GOOGLE_DRIVE_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects a link that is not Drive at all before any request goes out", async () => {
    await expect(resolveDriveLink("https://example.test/report.pdf")).rejects.toThrow(
      /not a Google Drive link/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns one entry for a file link", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "1Id",
        name: "Unit 3 notes.pdf",
        mimeType: "application/pdf",
        size: "2048",
      }),
    );
    const entries = await resolveDriveLink("https://drive.google.com/file/d/1Id/view");
    expect(entries).toEqual([
      {
        id: "1Id",
        name: "Unit 3 notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        isFolder: false,
      },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "https://www.googleapis.com/drive/v3/files/1Id",
    );
  });

  it("lists a folder's files and leaves its subfolders alone", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "1Folder",
          name: "Physics",
          mimeType: "application/vnd.google-apps.folder",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            { id: "a", name: "one.pdf", mimeType: "application/pdf", size: "10" },
            { id: "b", name: "Archive", mimeType: "application/vnd.google-apps.folder" },
            {
              id: "c",
              name: "two.docx",
              mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            },
          ],
        }),
      );
    const entries = await resolveDriveLink("https://drive.google.com/drive/folders/1Folder");
    expect(entries.map((entry) => entry.name)).toEqual(["one.pdf", "two.docx"]);
  });

  it("follows a shortcut to the file it points at", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "1Shortcut",
          name: "link to notes",
          mimeType: "application/vnd.google-apps.shortcut",
          shortcutDetails: { targetId: "1Real" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: "1Real", name: "notes.pdf", mimeType: "application/pdf", size: "5" }),
      );
    const entries = await resolveDriveLink("https://drive.google.com/file/d/1Shortcut/view");
    expect(entries[0].id).toBe("1Real");
  });

  it("says how to fix sharing rather than reporting a failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "forbidden" }, 403));
    const caught = await resolveDriveLink("https://drive.google.com/file/d/1Id/view").catch(
      (error) => error,
    );
    expect(caught).toBeInstanceOf(DriveLinkError);
    expect(caught.kind).toBe("sharing");
    expect(caught.message).toContain("Anyone with the link");
  });

  it("turns a folder link away when no API key is configured", async () => {
    vi.stubEnv("GOOGLE_DRIVE_API_KEY", "");
    await expect(
      resolveDriveLink("https://drive.google.com/drive/folders/1Folder"),
    ).rejects.toThrow(/GOOGLE_DRIVE_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("downloadDriveFile", () => {
  const fetchMock = vi.fn();
  const pdf = {
    id: "1Id",
    name: "notes.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10,
    isFolder: false,
  };

  beforeEach(() => {
    vi.stubEnv("GOOGLE_DRIVE_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("downloads a binary file as-is", async () => {
    fetchMock.mockResolvedValueOnce(bytesResponse(10));
    const result = await downloadDriveFile(pdf);
    expect(result.buffer.length).toBe(10);
    expect(result.fileName).toBe("notes.pdf");
    expect(String(fetchMock.mock.calls[0][0])).toContain("alt=media");
  });

  it("exports a Google Doc, which holds no bytes of its own", async () => {
    const doc = { ...pdf, name: "Chapter one", mimeType: "application/vnd.google-apps.document" };
    expect(driveFileName(doc)).toBe("Chapter one.pdf");
    expect(driveContentType(doc)).toBe("application/pdf");
    fetchMock.mockResolvedValueOnce(bytesResponse(4));
    const result = await downloadDriveFile(doc);
    const requested = String(fetchMock.mock.calls[0][0]);
    expect(requested).toContain("/export");
    expect(requested).toContain("mimeType=application%2Fpdf");
    expect(result.fileName).toBe("Chapter one.pdf");
  });

  /**
   * The cap is enforced while streaming, not from Content-Length: an exported
   * Google Doc reports no size at all, so trusting the header would let a file
   * exhaust this process before any size check ran.
   */
  it("stops reading once a file passes the upload ceiling", async () => {
    const oversized = 51 * 1024 * 1024;
    fetchMock.mockResolvedValueOnce(bytesResponse(oversized));
    const caught = await downloadDriveFile(pdf).catch((error) => error);
    expect(caught).toBeInstanceOf(DriveLinkError);
    expect(caught.kind).toBe("too-large");
    expect(caught.message).toContain("50 MB");
  });

  it("reads an HTML interstitial on the keyless path as a sharing problem", async () => {
    vi.stubEnv("GOOGLE_DRIVE_API_KEY", "");
    fetchMock.mockResolvedValueOnce(
      new Response("<html>Google Drive - Sign in</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    const caught = await downloadDriveFile(pdf).catch((error) => error);
    expect(caught).toBeInstanceOf(DriveLinkError);
    expect(caught.kind).toBe("sharing");
  });
});

/**
 * THE KEYLESS PATH, WHICH IS THE ONLY PATH A DEPLOYMENT WITHOUT A KEY HAS.
 *
 * Every other download test above stubs `GOOGLE_DRIVE_API_KEY`, so the branch
 * that actually runs in production was the branch nothing covered. These pin the
 * two things a teacher pasting a public link depends on.
 */
describe("public links with no API key", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("GOOGLE_DRIVE_API_KEY", "");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("downloads a public file link without any metadata call", async () => {
    const entries = await resolveDriveLink(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/view?usp=sharing",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array(8), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="unit-3-notes.pdf"',
        },
      }),
    );
    const download = await downloadDriveFile(entries[0]);
    expect(download.fileName).toBe("unit-3-notes.pdf");
    expect(download.mimeType).toBe("application/pdf");
    expect(String(fetchMock.mock.calls[0][0])).toContain("drive.usercontent.google.com");
  });

  /**
   * The regression this pair exists for: a Doc link resolved to an empty
   * mimeType, so the export branch was unreachable, so the Doc was fetched from
   * the binary host, which answers with HTML — and the teacher was told their
   * correctly-shared file was private.
   */
  it("exports a public Google Doc instead of fetching it as bytes", async () => {
    const entries = await resolveDriveLink(
      "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/edit",
    );
    expect(entries[0].mimeType).toBe("application/vnd.google-apps.document");

    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array(4), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="Chapter one.pdf"',
        },
      }),
    );
    const download = await downloadDriveFile(entries[0]);
    const requested = String(fetchMock.mock.calls[0][0]);
    expect(requested).toContain("docs.google.com/document/");
    expect(requested).toContain("format=pdf");
    expect(download.fileName).toBe("Chapter one.pdf");
    expect(download.mimeType).toBe("application/pdf");
  });

  it("reads a public Sheets link as a CSV export", async () => {
    const entries = await resolveDriveLink(
      "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/edit#gid=0",
    );
    expect(entries[0].mimeType).toBe("application/vnd.google-apps.spreadsheet");
    fetchMock.mockResolvedValueOnce(
      new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } }),
    );
    const download = await downloadDriveFile(entries[0]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("format=csv");
    expect(download.fileName).toBe("drive-export.csv");
  });

  it("does not index the sign-in page when a Doc is private", async () => {
    const entries = await resolveDriveLink(
      "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/edit",
    );
    fetchMock.mockResolvedValueOnce(
      new Response("<html>Sign in</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    const caught = await downloadDriveFile(entries[0]).catch((error) => error);
    expect(caught).toBeInstanceOf(DriveLinkError);
    expect(caught.kind).toBe("sharing");
  });
});
