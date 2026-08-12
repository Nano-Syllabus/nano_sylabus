export const TEACHER_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const TEACHER_UPLOAD_MAX_LABEL = "50 MB";

export function teacherUploadSizeError(size: number) {
  return size > TEACHER_UPLOAD_MAX_BYTES
    ? `This file is too large. Upload a file up to ${TEACHER_UPLOAD_MAX_LABEL}.`
    : "";
}
