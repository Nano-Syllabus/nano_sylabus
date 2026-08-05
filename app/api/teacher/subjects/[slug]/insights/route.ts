import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import {
  getTeacherCollectionCapture,
  getTeacherCollectionReadiness,
  getTeacherCollectionUsage,
  getTeacherCollectionWeightage,
  getTeacherPracticeChapters,
  getTeacherPracticeTopics,
  getTeacherSubjects,
  TeacherApiError,
  type ApiRecord,
} from "@/lib/teacher-app/client";

type RouteContext = { params: Promise<{ slug: string }> };

function reasonMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "The teacher API did not return this insight.";
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { slug } = await params;
    const subjectSlug = slug.trim();
    if (!subjectSlug || subjectSlug.length > 200) {
      return NextResponse.json({ error: "Invalid subject." }, { status: 400 });
    }

    const subjects = await getTeacherSubjects(teacher.collection_sk);
    const subject = subjects.subjects.find((item) => item.slug === subjectSlug);
    if (!subject) {
      return NextResponse.json({ error: "Subject not found in this teacher collection." }, { status: 404 });
    }
    const subjectName = typeof subject.name === "string" && subject.name.trim()
      ? subject.name.trim()
      : subjectSlug;
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";

    const names = ["capture", "readiness", "weightage", "topics", "chapters", "usage"] as const;
    const results = await Promise.allSettled([
      getTeacherCollectionCapture(teacher.collection_sk, subjectName),
      getTeacherCollectionReadiness(teacher.collection_sk, subjectName),
      getTeacherCollectionWeightage(teacher.collection_sk, subjectName),
      getTeacherPracticeTopics(teacher.collection_sk, subjectName, { refresh }),
      getTeacherPracticeChapters(teacher.collection_sk, subjectName),
      getTeacherCollectionUsage(teacher.collection_sk),
    ]);

    const invalidKey = results.some(
      (result) => result.status === "rejected"
        && result.reason instanceof TeacherApiError
        && result.reason.status === 401,
    );
    if (invalidKey) {
      return NextResponse.json(
        { error: "This teacher workspace key is no longer valid." },
        { status: 409 },
      );
    }

    const payload: Record<string, ApiRecord> = {};
    const partialErrors: Record<string, string> = {};
    results.forEach((result, index) => {
      const name = names[index];
      if (result.status === "fulfilled") payload[name] = result.value as ApiRecord;
      else partialErrors[name] = reasonMessage(result.reason);
    });

    return NextResponse.json({
      subject: { slug: subjectSlug, name: subjectName },
      ...payload,
      partialErrors,
    });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    return NextResponse.json(
      {
        error: apiError?.status === 401
          ? "This teacher workspace key is no longer valid."
          : "Could not load subject intelligence.",
      },
      { status: apiError?.status === 401 ? 409 : 502 },
    );
  }
}
