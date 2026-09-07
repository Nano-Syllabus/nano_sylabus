export const TEACHER_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const TEACHER_UPLOAD_MAX_LABEL = "50 MB";
export const TEACHER_SYLLABUS_FILE_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";

const TEACHER_SYLLABUS_FILE_PATTERN = /\.(pdf|doc|docx|txt|md|png|jpe?g|webp)$/i;

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
