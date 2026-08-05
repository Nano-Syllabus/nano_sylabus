import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { getTeacherCollectionUsage, TeacherApiError } from "@/lib/teacher-app/client";

export async function GET(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const since = new URL(request.url).searchParams.get("since")?.trim() || undefined;
    const usage = await getTeacherCollectionUsage(teacher.collection_sk, since);
    return NextResponse.json({ usage });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    return NextResponse.json(
      {
        error: apiError?.status === 401
          ? "This teacher workspace key is no longer valid."
          : "Could not load teacher API usage.",
      },
      { status: apiError?.status === 401 ? 409 : 502 },
    );
  }
}
