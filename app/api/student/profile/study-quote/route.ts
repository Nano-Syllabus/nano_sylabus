import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

const STUDY_QUOTE_LIMIT = 140;

const requestSchema = z.object({
  quote: z.string().trim().max(STUDY_QUOTE_LIMIT).nullable(),
});

/** Saves the signed-in student's personal study reminder on their profile. */
export async function PUT(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = requestSchema.parse(await request.json());
    const quote = parsed.quote?.trim() || null;
    // Keep this on the app profile, not in Supabase Auth metadata. This makes
    // the reminder available to every authenticated app surface and keeps it
    // in the same durable record as the student's other preferences.
    let { data, error } = await supabase
      .from("student_profiles")
      .update({ study_quote: quote })
      .eq("user_id", user.id)
      .select("study_quote")
      .maybeSingle();
    if (error) throw error;

    // Profiles are created during signup, but creating a minimal record here
    // makes the preference reliable for older accounts too. Do this only when
    // the row is absent so saving a quote never overwrites a chosen full name.
    if (!data) {
      const fullName =
        typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name.trim()
          ? user.user_metadata.full_name.trim()
          : user.email?.split("@")[0] || "Student";
      const created = await supabase
        .from("student_profiles")
        .insert({ user_id: user.id, full_name: fullName, study_quote: quote })
        .select("study_quote")
        .single();
      if (created.error) throw created.error;
      data = created.data;
    }

    return NextResponse.json({ quote: data.study_quote ?? "" });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Enter a reminder with at most 140 characters."
        : error instanceof Error
          ? error.message
          : "Could not save your quote.";

    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
