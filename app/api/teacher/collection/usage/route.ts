import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTeacherCollectionUsage, TeacherApiError } from "@/lib/teacher-app/client";

export async function GET(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const since = new URL(request.url).searchParams.get("since")?.trim() || undefined;
    const usage = await getTeacherCollectionUsage(teacher.collection_sk, since);
    // The backend knows each faculty only by slug; the card shows names. Any
    // faculty studying this collection's subjects is named, not just owned ones.
    const slugs = (Array.isArray(usage.by_community) ? usage.by_community : [])
      .map((bucket) => String((bucket as { community?: unknown }).community || ""))
      .filter(Boolean);
    let communityNames: Record<string, string> = {};
    if (slugs.length) {
      const { data } = await createSupabaseAdminClient()
        .from("communities")
        .select("slug,name")
        .in("slug", slugs);
      communityNames = Object.fromEntries((data || []).map((row) => [row.slug, row.name]));
    }
    return NextResponse.json({ usage, communityNames });
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
