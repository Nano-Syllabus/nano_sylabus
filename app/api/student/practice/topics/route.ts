import { NextResponse } from "next/server";
import { listTopicMastery } from "@/lib/data/student-mastery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantSubject, listPracticeTopics, listTenantSubjects } from "@/lib/tenant/client";
import { studentHasCourseSubjectAccess } from "@/lib/student-courses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const searchParams = new URL(request.url).searchParams;
    const requested = searchParams.get("subject")?.trim();
    if (!requested) {
      return NextResponse.json({ error: "A subject is required." }, { status: 400 });
    }
    const totalMarks = Number(searchParams.get("totalMarks") || searchParams.get("total_marks"));
    const maxQuestions = Number(
      searchParams.get("maxQuestions") || searchParams.get("max_questions"),
    );

    const subjects = await listTenantSubjects();
    const subject = findTenantSubject(subjects, requested);
    if (!subject) {
      return NextResponse.json({ error: "That subject is not available." }, { status: 404 });
    }
    if (!(await studentHasCourseSubjectAccess(user.id, subject.slug))) {
      return NextResponse.json(
        { error: "Enroll in a course containing this subject first." },
        { status: 403 },
      );
    }

    if (subject.chunk_count <= 0) {
      return NextResponse.json({
        subject: { name: subject.name, slug: subject.slug, providerName: subject.namespace },
        practiceAvailable: false,
        topicSource: "",
        questionBankQuestions: 0,
        weightageBasis: "",
        topics: [],
        suggestedPlan: [],
      });
    }

    const [topics, mastery] = await Promise.all([
      listPracticeTopics({
        subject: subject.slug,
        namespaces: [subject.namespace],
        totalMarks: Number.isFinite(totalMarks) && totalMarks > 0 ? totalMarks : undefined,
        maxQuestions: Number.isFinite(maxQuestions) && maxQuestions > 0 ? maxQuestions : undefined,
      }),
      listTopicMastery(user.id),
    ]);

    // Sent alongside the chapters so callers can colour them in and pre-select
    // the weak ones without a second round trip.
    const masteryByTopic = new Map(
      mastery.filter((row) => row.subjectSlug === subject.slug).map((row) => [row.topicKey, row]),
    );

    return NextResponse.json({
      subject: { name: subject.name, slug: subject.slug, providerName: subject.namespace },
      practiceAvailable: true,
      topicSource: topics.topic_source,
      questionBankQuestions: topics.question_bank_questions ?? 0,
      weightageBasis: topics.weightage_basis ?? "",
      topics: topics.topics.map((topic) => {
        const row = masteryByTopic.get(topic.topic_key);
        return {
          ...topic,
          status: row?.status ?? "not_attempted",
          percentage: row?.percentage ?? 0,
          attempts: row?.attempts ?? 0,
          lostWeightage: row?.lostWeightage ?? 0,
        };
      }),
      suggestedPlan: topics.suggested_plan,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load practice topics." },
      { status: 502 },
    );
  }
}
