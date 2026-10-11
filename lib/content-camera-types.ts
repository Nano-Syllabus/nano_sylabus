import type { AnswerSheetPage } from "@/lib/data/challenge-answer-sheet";

export const CONTENT_CAMERA_MAX_PAGES = 50;
export const CONTENT_CAMERA_MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export type ContentCameraState = {
  id: string;
  title: string;
  expiresAt: string;
  revision: number;
  pages: AnswerSheetPage[];
  pendingCount: number;
  maxPages: number;
};
export type ContentCameraLink = { id: string; token: string };
