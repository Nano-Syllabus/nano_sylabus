import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import {
  deleteTeacherPath,
  deleteTeacherSubject,
  getTeacherSubjects,
  TeacherApiError,
  type ApiRecord,
} from "@/lib/teacher-app/client";

type RouteContext = { params: Promise<{ slug: string }> };

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { slug } = await params;
    const trimmedSlug = slug.trim();
    if (!trimmedSlug || trimmedSlug.length > 200) {
      return NextResponse.json({ error: "Invalid subject." }, { status: 400 });
    }

    const subjects = await getTeacherSubjects(teacher.collection_sk);
    const subject = subjects.subjects.find((item) => item.slug === trimmedSlug);
    if (!subject) {
      return NextResponse.json({ error: "Subject not found in this teacher collection." }, { status: 404 });
    }

    const deleteFiles = new URL(request.url).searchParams.get("deleteFiles") === "1";
    const folderPath = typeof (subject as ApiRecord).folder_path === "string"
      ? String((subject as ApiRecord).folder_path).trim()
      : "";
    if (deleteFiles) {
      const unsafeFolder = !folderPath || folderPath.startsWith("/") || folderPath.includes("\\")
        || folderPath.split("/").some((part) => !part || part === "." || part === "..");
      if (unsafeFolder) {
        return NextResponse.json(
          { error: "This subject does not have a safe collection folder to delete." },
          { status: 400 },
        );
      }
      await deleteTeacherPath(teacher.collection_sk, folderPath);
    }

    await deleteTeacherSubject(teacher.collection_sk, trimmedSlug);
    return NextResponse.json({ deleted: true, filesDeleted: deleteFiles });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    const status = apiError?.status === 401 ? 409 : apiError?.status === 404 ? 404 : 502;
    return NextResponse.json(
      {
        error:
          apiError?.status === 401
            ? "This teacher workspace key is no longer valid."
            : apiError?.status === 404
              ? "Subject or source folder was not found."
              : "Could not remove the subject.",
      },
      { status },
    );
  }
}
