export const TEACHER_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const TEACHER_UPLOAD_MAX_LABEL = "50 MB";
export const TEACHER_SYLLABUS_FILE_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";
export const TEACHER_MATERIAL_FILE_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";

const TEACHER_SYLLABUS_FILE_PATTERN = /\.(pdf|doc|docx|txt|md|png|jpe?g|webp)$/i;
const TEACHER_MATERIAL_FILE_PATTERN = /\.(pdf|docx?|pptx?|txt|md|csv|png|jpe?g|webp)$/i;

const STORAGE_FILE_NAME_MAX_LENGTH = 120;

/**
 * Builds a portable object/file name for Supabase Storage and the document
 * service. The user's original name is kept separately for display.
 */
export function teacherUploadStorageFileName(name: string) {
  const clean = name.trim().replace(/[\\/\r\n]/g, "_");
  const extensionMatch = clean.match(/\.([a-zA-Z0-9]{1,16})$/);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : "";
  const stemSource = extension ? clean.slice(0, -extension.length) : clean;
  const stem = stemSource
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  const maxStemLength = STORAGE_FILE_NAME_MAX_LENGTH - extension.length;
  const shortenedStem = stem.slice(0, maxStemLength).replace(/[-_]+$/g, "") || "upload";

  return `${shortenedStem}${extension}`;
}

export function teacherUploadSizeError(size: number) {
  return size > TEACHER_UPLOAD_MAX_BYTES
    ? `This file is too large. Upload a file up to ${TEACHER_UPLOAD_MAX_LABEL}.`
    : "";
}

export function isTeacherSyllabusFileSupported(fileName: string) {
  return TEACHER_SYLLABUS_FILE_PATTERN.test(fileName.trim());
}

/**
 * Whether this shelf can read this file at all.
 *
 * The file picker enforces the same lists through `accept`, which is a hint the
 * browser is free to ignore and which a Drive folder never passes through at
 * all — a folder import has to be filtered against the same rule server-side,
 * so the rule lives here rather than inline in the dialog.
 */
export function isTeacherUploadFileSupported(fileName: string, shelf: string) {
  const name = fileName.trim();
  return shelf === "Syllabus"
    ? TEACHER_SYLLABUS_FILE_PATTERN.test(name)
    : TEACHER_MATERIAL_FILE_PATTERN.test(name);
}

/** The shelf a collection folder path sits under, e.g. "Physics/Notes" -> "Notes". */
export function teacherUploadShelf(path: string) {
  const segments = path.split("/").filter(Boolean);
  const shelf = segments.find((segment) =>
    ["Syllabus", "Notes", "Question Bank"].includes(segment),
  );
  return shelf || "Notes";
}
