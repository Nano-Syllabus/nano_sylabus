import { NextResponse } from "next/server";
import { getEnrollmentExam, getExamPlans } from "@/lib/data/exam-enrollment";
import {
  EXAM_INTENT_COOKIE,
  examIntentSchema,
  validateExamAnswers,
  examBillingMonths,
} from "@/lib/exam-enrollment";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 8192)
    return NextResponse.json({ error: "Preparation answers are too long." }, { status: 400 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid preparation details." }, { status: 400 });
  }
  const parsed = examIntentSchema.safeParse(body);
  if (!parsed.success || parsed.data.examSlug !== (await params).slug)
    return NextResponse.json({ error: "Choose a valid exam and plan." }, { status: 400 });
  try {
    const intent = parsed.data;
    const exam = await getEnrollmentExam(intent.examSlug);
    if (!exam) return NextResponse.json({ error: "This exam is not available." }, { status: 404 });
    if (!examBillingMonths(exam.config).includes(intent.billingMonths))
      return NextResponse.json(
        { error: "Choose an available duration for this exam." },
        { status: 400 },
      );
    if (!(await getExamPlans(exam)).some((plan) => plan.id === intent.planId))
      return NextResponse.json(
        { error: "This payment plan is not available for this exam." },
        { status: 400 },
      );
    intent.answers = validateExamAnswers(exam.config, intent.answers);
    const response = NextResponse.json({ next: `/payment/${exam.slug}` });
    response.cookies.set(EXAM_INTENT_COOKIE, JSON.stringify(intent), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 86400,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare checkout." },
      { status: 400 },
    );
  }
}
