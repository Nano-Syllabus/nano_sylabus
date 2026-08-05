import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import {
  createTeacherFolder,
  getTeacherSubjects,
  TeacherApiError,
  type ApiRecord,
} from "@/lib/teacher-app/client";

const shelves = new Set(["Syllabus", "Notes", "Question Bank"]);

function cleanFolderName(value: unknown) {
  if (typeof value !== "string") return "";
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80 || name === "." || name === "..") return "";
  if (/[\\/\u0000-\u001f]/.test(name)) return "";
  return name;
}

export async function POST(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as {
      subjectSlug?: unknown;
      shelf?: unknown;
      name?: unknown;
    } | null;
    const subjectSlug = typeof body?.subjectSlug === "string" ? body.subjectSlug.trim() : "";
    const shelf = typeof body?.shelf === "string" ? body.shelf.trim() : "";
    const name = cleanFolderName(body?.name);
    if (!subjectSlug || !shelves.has(shelf) || !name) {
      return NextResponse.json(
        { error: "Choose a subject and shelf, then enter a folder name up to 80 characters without slashes." },
        { status: 400 },
      );
    }

    const subjects = await getTeacherSubjects(teacher.collection_sk);
    const subject = subjects.subjects.find((item) => item.slug === subjectSlug);
    if (!subject) {
      return NextResponse.json({ error: "Subject not found in this teacher collection." }, { status: 404 });
    }
    const folderPath = typeof (subject as ApiRecord).folder_path === "string"
      ? String((subject as ApiRecord).folder_path).trim()
      : "";
    const unsafeRoot = !folderPath || folderPath.startsWith("/") || folderPath.includes("\\")
      || folderPath.split("/").some((part) => !part || part === "." || part === "..");
    if (unsafeRoot) {
      return NextResponse.json({ error: "This subject does not have a safe collection folder." }, { status: 400 });
    }

    const path = `${folderPath}/${shelf}/${name}`;
    const folder = await createTeacherFolder(teacher.collection_sk, path);
    return NextResponse.json({ folder, path, name, shelf }, { status: 201 });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    const status = apiError?.status === 401 ? 409 : apiError?.status === 409 ? 409 : 502;
    return NextResponse.json(
      {
        error: apiError?.status === 401
          ? "This teacher workspace key is no longer valid."
          : apiError?.status === 409
            ? "That chapter folder already exists."
            : "Could not create the chapter folder.",
      },
      { status },
    );
  }
}
