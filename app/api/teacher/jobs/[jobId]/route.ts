import { NextResponse } from "next/server";
import { getWorkspaceTeacher } from "@/app/teachers/actions";
import {
  getTeacherJob,
  invalidateTeacherPracticeTopics,
  invalidateTeacherReads,
  TeacherApiError,
} from "@/lib/teacher-app/client";
import { indexingOutcome } from "@/lib/teacher-index-reconcile";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const teacher = await getWorkspaceTeacher();
    if (!teacher) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;
    const trimmed = jobId.trim();
    if (!trimmed || trimmed.length > 200) {
      return NextResponse.json({ error: "Invalid indexing job." }, { status: 400 });
    }

    const job = await getTeacherJob(teacher.collection_sk, trimmed);
    // A finished job is when a file turns "Indexed": the cached reads of the
    // collection (documents, readiness…) are wrong from here on.
    if (indexingOutcome(job as Record<string, unknown>) !== "indexing") {
      invalidateTeacherReads(teacher.collection_sk);
      invalidateTeacherPracticeTopics(teacher.collection_sk);
    }
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
