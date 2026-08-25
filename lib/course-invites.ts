import { randomBytes } from "node:crypto";

export function createCourseInviteCode() {
  return randomBytes(16).toString("hex").toUpperCase();
}
