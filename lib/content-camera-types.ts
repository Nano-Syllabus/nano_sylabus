export const CONTENT_CAMERA_MAX_PAGES = 50;
export const CONTENT_CAMERA_MAX_PDF_BYTES = 50 * 1024 * 1024;
export type ContentCameraPdf = {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  uploadedAt: string;
};
export type ContentCameraState = {
  id: string;
  title: string;
  expiresAt: string;
  maxPages: number;
  pdf: ContentCameraPdf | null;
};
export type ContentCameraLink = { id: string; token: string };
export type ContentCameraPhoto = {
  id: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
};
