import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { getTeacherJob, TeacherApiError } from "@/lib/teacher-app/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;
    const trimmed = jobId.trim();
    if (!trimmed || trimmed.length > 200) {
      return NextResponse.json({ error: "Invalid indexing job." }, { status: 400 });
    }

    const job = await getTeacherJob(teacher.collection_sk, trimmed);
    return NextResponse.json({ job });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    const status = apiError?.status === 404 ? 404 : apiError?.status === 401 ? 409 : 502;
    return NextResponse.json(
      {
        error:
          apiError?.status === 404
            ? "Indexing job not found."
            : apiError?.status === 401
              ? "This teacher workspace key is no longer valid."
              : "Could not check the indexing job.",
      },
      { status },
    );
  }
}
