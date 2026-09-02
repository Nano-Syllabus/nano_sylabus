import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { createCommunityPost } from "@/lib/data/community-subjects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ slug: string; subjectId: string }> };

function value(form: FormData, name: string) {
  const entry = form.get(name);
  return typeof entry === "string" ? entry.trim() : "";
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to post." }, { status: 401 });
    const form = await request.formData();
    const postType = value(form, "postType") === "discussion" ? "discussion" : "resource";
    const requestedShelf = value(form, "shelf");
    const shelf = requestedShelf === "Syllabus" || requestedShelf === "Notes"
      ? requestedShelf
      : "Question Bank";
    const attachment = form.get("file");
    const { slug, subjectId } = await context.params;
    const post = await createCommunityPost({
      userId: user.id,
      communitySlug: slug,
      subjectId,
      title: value(form, "title"),
      body: value(form, "body"),
      postType,
      shelf,
      file: attachment instanceof File ? attachment : null,
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
