import { randomBytes } from "node:crypto";

export function createTeacherClassroomJoinCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}
