import { TEACHER_UPLOAD_MAX_BYTES, TEACHER_UPLOAD_MAX_LABEL } from "@/lib/teacher-upload";

/**
 * Importing a shared Google Drive link as if the teacher had picked the file.
 *
 * SCOPE, AND WHY IT STOPS WHERE IT DOES
 * -------------------------------------
 * This reads files shared as "Anyone with the link" and nothing else. That is a
 * deliberate ceiling, not an oversight: reading a teacher's PRIVATE Drive needs
 * the `drive.readonly` OAuth scope, which Google classes as RESTRICTED — a
 * third-party security assessment before it may be used in production. A link a
 * teacher has already chosen to share needs no credential at all, and it covers
 * the case this feature exists for: "here are my notes, index them".
 *
 * So a private link is not an error to be retried. It is a sharing setting, and
 * `DriveLinkError` says exactly which one to change.
 *
 * NEVER FETCH THE PASTED URL
 * --------------------------
 * The teacher's string is parsed for a file id and then thrown away; every
 * request this module makes is built from that id against a hard-coded Google
 * host. A pasted URL reaching `fetch` unmodified is server-side request forgery
 * with extra steps — it would let anyone with a creator account use this server
 * to probe hosts it can reach and the caller cannot.
 */

const API_ROOT = "https://www.googleapis.com/drive/v3";
/** The credential-free download host, for when no API key is configured. */
const USERCONTENT_ROOT = "https://drive.usercontent.google.com/download";
const REQUEST_TIMEOUT_MS = 60_000;

/** Google-native types hold no bytes of their own and must be exported instead. */
const EXPORTS: Record<string, { mimeType: string; extension: string; docsPath: string }> = {
  "application/vnd.google-apps.document": {
    mimeType: "application/pdf",
    extension: ".pdf",
    docsPath: "document",
  },
  "application/vnd.google-apps.presentation": {
    mimeType: "application/pdf",
    extension: ".pdf",
    docsPath: "presentation",
  },
  "application/vnd.google-apps.spreadsheet": {
    mimeType: "text/csv",
    extension: ".csv",
    docsPath: "spreadsheets",
  },
};

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * `docs.google.com/document/d/…` → the native type behind that editor.
 *
 * This is the only thing that tells a KEYLESS import what it is looking at. With
 * no API key there is no metadata call, so `resolveDriveLink` has no mimeType to
 * report — and without one, a Doc, a Sheet and a PDF are indistinguishable and
 * all three get sent to the binary download host. For a Doc that host answers
 * with HTML, which the code below then reports as a sharing problem: the teacher
 * is told to fix a setting that was never wrong. The path segment is the fact
 * that was sitting in the URL the whole time.
 */
const DOCS_PATH_MIME: Record<string, string> = {
  document: "application/vnd.google-apps.document",
  presentation: "application/vnd.google-apps.presentation",
  spreadsheets: "application/vnd.google-apps.spreadsheet",
};
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
/** One page is plenty for a shelf; a folder past this is a filing problem. */
const MAX_FOLDER_FILES = 100;

export class DriveLinkError extends Error {
  constructor(
    message: string,
    /** `sharing` is the one a teacher can fix themselves, and says how. */
    readonly kind: "invalid" | "sharing" | "not-found" | "too-large" | "unsupported" | "upstream",
  ) {
    super(message);
    this.name = "DriveLinkError";
  }
}

export type DriveEntry = {
  id: string;
  name: string;
  mimeType: string;
  /** 0 when Drive does not report one — Google-native files have no size. */
  sizeBytes: number;
  isFolder: boolean;
};

export type DriveDownload = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

function apiKey() {
  return (process.env.GOOGLE_DRIVE_API_KEY || "").trim();
}

/** Whether folder links and Google Docs exports can be resolved at all. */
export function driveFolderSupportEnabled() {
  return Boolean(apiKey());
}

/**
 * The file or folder id inside a pasted Drive/Docs URL.
 *
 * Accepts what teachers actually paste — the share-dialog URL, the address bar,
 * `open?id=`, a bare id — and rejects everything else rather than guessing. A
 * host allowlist is the check that matters: `docs.google.com.evil.test/d/x/`
 * matches the path shape perfectly.
 */
export function parseDriveLink(
  raw: string,
): { id: string; kind: "file" | "folder"; docsMime?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // A bare id, which the share dialog does not produce but people do paste.
  if (/^[A-Za-z0-9_-]{20,}$/.test(trimmed)) return { id: trimmed, kind: "file" };

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!["drive.google.com", "docs.google.com", "drive.usercontent.google.com"].includes(host)) {
    return null;
  }

  const folder = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (folder) return { id: folder[1], kind: "folder" };

  const path = url.pathname.match(/\/d\/([A-Za-z0-9_-]+)/);
  if (path) {
    const editor = url.pathname.match(/^\/(document|presentation|spreadsheets)\//)?.[1];
    const docsMime = editor ? DOCS_PATH_MIME[editor] : undefined;
    return docsMime ? { id: path[1], kind: "file", docsMime } : { id: path[1], kind: "file" };
  }

  const query = url.searchParams.get("id");
  if (query && /^[A-Za-z0-9_-]+$/.test(query)) return { id: query, kind: "file" };
  return null;
}

async function driveJson(path: string, params: Record<string, string>) {
  const key = apiKey();
  if (!key) throw new DriveLinkError("The Drive API key is not configured.", "upstream");
  const url = new URL(`${API_ROOT}${path}`);
  for (const [name, value] of Object.entries({ ...params, key })) {
    url.searchParams.set(name, value);
  }
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 403 || response.status === 401) {
    throw new DriveLinkError(sharingMessage(), "sharing");
  }
  if (response.status === 404) {
    throw new DriveLinkError(
      "Google Drive has no file at that link. Check the link and paste it again.",
      "not-found",
    );
  }
  if (!response.ok) {
    throw new DriveLinkError(`Google Drive returned ${response.status}.`, "upstream");
  }
  return (await response.json()) as Record<string, unknown>;
}

function sharingMessage() {
  return (
    "This Drive item is not shared publicly. Open it in Drive, press Share, set " +
    'General access to "Anyone with the link" as Viewer, then paste the link again. ' +
    "Reading a private Drive would need a Google account connection this app does not have."
  );
}

function entryFrom(record: Record<string, unknown>): DriveEntry {
  const mimeType = String(record.mimeType || "application/octet-stream");
  return {
    id: String(record.id || ""),
    name: String(record.name || "").trim() || "Drive file",
    mimeType,
    sizeBytes: Number(record.size || 0) || 0,
    isFolder: mimeType === DRIVE_FOLDER_MIME,
  };
}

/**
 * One file's metadata, fetched server-side. Null when there is no API key.
 *
 * The import worker needs this because the metadata it was HANDED came from the
 * browser, and the browser only has it when the resolve that produced it ran with
 * a key. Without one, the row reaches the queue with no name, no type and size 0
 * — and a size of 0 is indistinguishable from "unknown", so the cheap size guard
 * silently does not fire. That is how a 97.9 MB PDF got past a 50 MB ceiling and
 * wedged its row in `importing`: nothing rejected it, and the download it should
 * never have started was left to fail on its own.
 *
 * The worker runs on the server, where the key lives, so it can simply ask.
 */
export async function fetchDriveMetadata(fileId: string): Promise<DriveEntry | null> {
  if (!apiKey()) return null;
  const record = await driveJson(`/files/${encodeURIComponent(fileId)}`, {
    fields: "id,name,mimeType,size",
    supportsAllDrives: "true",
  });
  return entryFrom(record);
}

/** What a link points at: one file, or the files directly inside one folder. */
export async function resolveDriveLink(raw: string): Promise<DriveEntry[]> {
  const parsed = parseDriveLink(raw);
  if (!parsed) {
    throw new DriveLinkError(
      "That is not a Google Drive link. Copy the link from Drive's Share dialog and paste it here.",
      "invalid",
    );
  }

  if (!apiKey()) {
    if (parsed.kind === "folder") {
      throw new DriveLinkError(
        "Folder links are not available on this deployment. Link a single file instead, or ask an administrator to set GOOGLE_DRIVE_API_KEY.",
        "unsupported",
      );
    }
    // Without a key there is no metadata call, so the name is read off the
    // download response instead and the entry here is mostly a placeholder. The
    // TYPE is not guesswork though when the link is an editor URL: that is what
    // sends a Doc down the export path rather than the binary one.
    return [
      { id: parsed.id, name: "", mimeType: parsed.docsMime || "", sizeBytes: 0, isFolder: false },
    ];
  }

  const record = await driveJson(`/files/${encodeURIComponent(parsed.id)}`, {
    fields: "id,name,mimeType,size,shortcutDetails",
    supportsAllDrives: "true",
  });

  // A shortcut is a pointer, and indexing the pointer indexes nothing.
  const shortcut = record.shortcutDetails as Record<string, unknown> | undefined;
  if (String(record.mimeType || "") === SHORTCUT_MIME && shortcut?.targetId) {
    return resolveDriveLink(`https://drive.google.com/file/d/${String(shortcut.targetId)}/view`);
  }

  const entry = entryFrom(record);
  if (!entry.isFolder) return [entry];

  const listing = await driveJson("/files", {
    q: `'${parsed.id}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size)",
    pageSize: String(MAX_FOLDER_FILES),
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const files = (Array.isArray(listing.files) ? listing.files : [])
    .map((item) => entryFrom(item as Record<string, unknown>))
    // One level only. A shelf is a flat list of documents, and walking a tree
    // would import a teacher's whole Drive from one paste of the wrong link.
    .filter((item) => !item.isFolder && item.id);
  if (!files.length) {
    throw new DriveLinkError(
      `"${entry.name}" has no files in it. Open the folder in Drive and check it is the right one.`,
      "not-found",
    );
  }
  return files;
}

/** The name this file should be stored under, with an extension it can be read by. */
export function driveFileName(entry: DriveEntry) {
  const exported = EXPORTS[entry.mimeType];
  if (!exported) return entry.name;
  return entry.name.toLowerCase().endsWith(exported.extension)
    ? entry.name
    : `${entry.name}${exported.extension}`;
}

/** The type the bytes will actually arrive as — an export type for Docs/Sheets/Slides. */
export function driveContentType(entry: DriveEntry) {
  return EXPORTS[entry.mimeType]?.mimeType || entry.mimeType;
}

/**
 * Read the response body, refusing anything past the upload ceiling.
 *
 * Checked while streaming rather than after, because Drive does not report a
 * size for exported Google Docs and reports nothing at all on the credential-
 * free path — so `Content-Length` cannot be trusted to stop a file that would
 * exhaust this process's memory before the size check ever ran.
 */
async function readCapped(response: Response, label: string) {
  const reader = response.body?.getReader();
  if (!reader) throw new DriveLinkError("Google Drive returned an empty response.", "upstream");
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > TEACHER_UPLOAD_MAX_BYTES) {
      await reader.cancel();
      throw new DriveLinkError(
        `${label} is larger than ${TEACHER_UPLOAD_MAX_LABEL}, which is the most this portal accepts.`,
        "too-large",
      );
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function driveFetch(url: URL, label: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (response.status === 401 || response.status === 403) {
    throw new DriveLinkError(sharingMessage(), "sharing");
  }
  if (response.status === 404) {
    throw new DriveLinkError(`${label} no longer exists in Drive.`, "not-found");
  }
  if (!response.ok) {
    throw new DriveLinkError(`Google Drive returned ${response.status} for ${label}.`, "upstream");
  }
  return response;
}

/** The bytes of one shared Drive file, exporting it first if it is a Google Doc. */
export async function downloadDriveFile(entry: DriveEntry): Promise<DriveDownload> {
  const key = apiKey();
  const exported = EXPORTS[entry.mimeType];
  const label = entry.name ? `"${entry.name}"` : "That Drive file";

  if (exported) {
    const url = key
      ? new URL(`${API_ROOT}/files/${encodeURIComponent(entry.id)}/export`)
      : new URL(
          `https://docs.google.com/${exported.docsPath}/d/${encodeURIComponent(entry.id)}/export`,
        );
    if (key) {
      url.searchParams.set("mimeType", exported.mimeType);
      url.searchParams.set("key", key);
    } else {
      url.searchParams.set("format", exported.extension.slice(1));
    }
    const response = await driveFetch(url, label);
    // A private Doc is not a 403 on the keyless export host either — it is a
    // sign-in page with a 200. Indexing that would file Google's login markup
    // as the teacher's chapter.
    if (!key && (response.headers.get("content-type") || "").includes("text/html")) {
      throw new DriveLinkError(sharingMessage(), "sharing");
    }
    // Keyless there is no metadata, so the title comes off the export response.
    const named = entry.name || driveNameFromResponse(response) || "drive-export";
    return {
      buffer: await readCapped(response, label),
      fileName: driveFileName({ ...entry, name: named }),
      mimeType: exported.mimeType,
    };
  }

  if (key) {
    const url = new URL(`${API_ROOT}/files/${encodeURIComponent(entry.id)}`);
    url.searchParams.set("alt", "media");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("key", key);
    const response = await driveFetch(url, label);
    return {
      buffer: await readCapped(response, label),
      fileName: entry.name,
      mimeType: entry.mimeType || "application/octet-stream",
    };
  }

  // No API key: the public download host, which serves an HTML interstitial
  // rather than a 403 when the file is private, so the type is what tells us.
  const url = new URL(USERCONTENT_ROOT);
  url.searchParams.set("id", entry.id);
  url.searchParams.set("export", "download");
  url.searchParams.set("confirm", "t");
  const response = await driveFetch(url, label);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new DriveLinkError(sharingMessage(), "sharing");
  }
  return {
    buffer: await readCapped(response, label),
    fileName: entry.name || driveNameFromResponse(response) || "drive-file",
    mimeType: contentType.split(";")[0].trim() || "application/octet-stream",
  };
}

/** The filename off a `Content-Disposition`, for the keyless path that has no metadata. */
function driveNameFromResponse(response: Response) {
  const disposition = response.headers.get("content-disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]).trim();
    } catch {
      // Fall through to the plain form below.
    }
  }
  return (disposition.match(/filename="?([^";]+)"?/i)?.[1] || "").trim();
}
