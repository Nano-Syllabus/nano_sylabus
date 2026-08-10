import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublishedCatalog } from "@/lib/tenant/marketplace-catalog";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const catalog = await getPublishedCatalog();
    const admin = createSupabaseAdminClient();
    const { data: profiles } = await admin
      .from("teacher_subject_profiles")
      .select(
        "teacher_id,subject_slug,subject_name,subject_code,university,programme,teachers(handle)",
      );
    const profileRows = profiles || [];
    const providerKey = (provider: string, subject: string) =>
      `${provider.trim().toLowerCase()}::${subject.trim().toLowerCase()}`;
    const profilesByProviderSlug = new Map(
      profileRows.map((profile) => {
        const teacher = Array.isArray(profile.teachers) ? profile.teachers[0] : profile.teachers;
        return [
          providerKey(String(teacher?.handle || ""), String(profile.subject_slug || "")),
          profile,
        ];
      }),
    );
    const profilesByProviderName = new Map(
      profileRows.map((profile) => {
        const teacher = Array.isArray(profile.teachers) ? profile.teachers[0] : profile.teachers;
        return [
          providerKey(String(teacher?.handle || ""), String(profile.subject_name || "")),
          profile,
        ];
      }),
    );

    const enrichSubject = (
      subject: (typeof catalog.subjects)[number],
      providerNamespace = subject.namespace,
    ) => {
      const profile =
        profilesByProviderSlug.get(providerKey(providerNamespace, subject.slug)) ??
        profilesByProviderName.get(providerKey(providerNamespace, subject.name));

      return {
        ...subject,
        code: profile?.subject_code || "",
        university: profile?.university || "",
        programme: profile?.programme || "",
      };
    };

    const subjects = catalog.subjects.map((subject) => enrichSubject(subject));
    const subjectsBySlug = new Map(subjects.map((subject) => [subject.slug, subject]));
    const providers = catalog.providers.map((provider) => ({
      ...provider,
      subjects: provider.subjects.map((subject) => {
        const enriched = enrichSubject(subject, provider.namespace);
        return enriched.code || enriched.university || enriched.programme
          ? enriched
          : (subjectsBySlug.get(subject.slug) ?? enriched);
      }),
    }));

    return NextResponse.json({
      providers,
      subjects,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load the published subject catalog.",
      },
      { status: 500 },
    );
  }
}
