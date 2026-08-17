import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  findTenantSubjectForCourseSubject,
  getMcqSet,
  listTenantSubjects,
} from "@/lib/tenant/client";
import { getStudentCourseSubjectAccess } from "@/lib/student-courses";
import { safeMcqSet } from "../safe-set";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const subjectSlug = z.string().trim().min(1).parse(new URL(request.url).searchParams.get("subject"));
    const access = await getStudentCourseSubjectAccess(user.id, subjectSlug);
    if (!access) return NextResponse.json({ error: "Enroll in this subject first." }, { status: 403 });
    const subject = findTenantSubjectForCourseSubject(await listTenantSubjects(), access);
    if (!subject) return NextResponse.json({ error: "That course subject is not available." }, { status: 404 });

    const { setId } = await params;
    const set = await getMcqSet(setId);
    if (set.subject && set.subject !== subject.slug) {
      return NextResponse.json({ error: "That quiz does not belong to this subject." }, { status: 404 });
    }
    return NextResponse.json({ ...safeMcqSet(set), subject: { name: subject.name, slug: subject.slug } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open this MCQ quiz.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
