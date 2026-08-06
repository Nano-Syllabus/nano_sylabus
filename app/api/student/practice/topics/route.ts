import { NextResponse } from "next/server";
import { listTopicMastery } from "@/lib/data/student-mastery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listPracticeTopics } from "@/lib/tenant/client";
import { getPublishedCatalog, findPublishedSubject } from "@/lib/tenant/marketplace-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const requested = new URL(request.url).searchParams.get("subject")?.trim();
    if (!requested) {
      return NextResponse.json({ error: "A subject is required." }, { status: 400 });
    }

    const catalog = await getPublishedCatalog();
    const subject = findPublishedSubject(catalog, requested);
    if (!subject) {
      return NextResponse.json({ error: "That subject is not published." }, { status: 404 });
    }

    const [topics, mastery] = await Promise.all([
      listPracticeTopics({ subject: subject.slug, namespaces: [subject.namespace] }),
      listTopicMastery(user.id),
    ]);

    // Sent alongside the chapters so callers can colour them in and pre-select
    // the weak ones without a second round trip.
    const masteryByTopic = new Map(
      mastery.filter((row) => row.subjectSlug === subject.slug).map((row) => [row.topicKey, row]),
    );

    return NextResponse.json({
      subject: { name: subject.name, slug: subject.slug, providerName: subject.providerName },
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
