import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeSubjects } from "@/lib/profile-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublishedSubject, getPublishedCatalog } from "@/lib/tenant/marketplace-catalog";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  action: z.enum(["add", "remove"]).default("add"),
});

/** Adds or drops one published subject on the signed-in student's profile. */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = requestSchema.parse(await request.json());

    const { data: profile, error: profileError } = await supabase
      .from("student_profiles")
      .select("subjects")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const current = normalizeSubjects(Array.isArray(profile?.subjects) ? profile.subjects : []);
    let next = current;

    if (parsed.action === "add") {
      // Only a published subject can be picked — anything else would resolve to
      // no material when chat or practice tried to scope to it.
      const catalog = await getPublishedCatalog();
      const subject = findPublishedSubject(catalog, parsed.subject);
      if (!subject) {
        return NextResponse.json({ error: "That subject is not published." }, { status: 404 });
      }

      next = current.some((item) => item.toLowerCase() === subject.name.toLowerCase())
        ? current
        : normalizeSubjects([...current, subject.name]);
    } else {
      next = current.filter((item) => item.toLowerCase() !== parsed.subject.toLowerCase());
    }

    const { error: updateError } = await supabase
      .from("student_profiles")
      .update({ subjects: next })
      .eq("user_id", user.id);
    if (updateError) throw updateError;

    return NextResponse.json({ subjects: next });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Invalid subject request."
        : error instanceof Error
          ? error.message
          : "Could not update your subjects.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
