import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createTeacherSubject, TeacherApiError } from "@/lib/teacher-app/client";

function validSubjectName(value: unknown) {
  if (typeof value !== "string") return "";
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) return "";
  if (name === "." || name === "..") return "";
  if (/[\\/\u0000-\u001f]/.test(name)) return "";
  return name;
}

export async function POST(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = validSubjectName(body?.name);
    if (!name) {
      return NextResponse.json(
        { error: "Enter a subject name up to 120 characters, without slashes." },
        { status: 400 },
      );
    }

    const subject = await createTeacherSubject(teacher.collection_sk, name);
    return NextResponse.json({ subject }, { status: 201 });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    const invalidKey = apiError?.status === 401;
    const conflict = apiError?.status === 409;

    return NextResponse.json(
      {
        error: invalidKey
          ? "This teacher workspace key is no longer valid. Ask an administrator to rotate it."
          : conflict
            ? apiError.message || "That subject already exists."
            : "Could not create the subject. Please try again.",
      },
      { status: invalidKey || conflict ? 409 : 502 },
    );
  }
}
