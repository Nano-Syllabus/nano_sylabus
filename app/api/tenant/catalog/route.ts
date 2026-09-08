import { CACHE, errorJson, privateJson } from "@/lib/http/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublishedCatalog } from "@/lib/tenant/marketplace-catalog";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

/**
 * The published subject catalog, for every surface that shows a course list.
 *
 * The slowest read in the product gets both halves of the caching story:
 * `getPublishedCatalog` memoises the upstream join in-process (2 min fresh, 10
 * min stale-while-revalidate), and `privateJson` gives the response an ETag so
 * the repeat asks that TanStack Query does still make come back as a bodyless
 * 304 rather than a re-serialised catalog.
 *
 * `privateJson` and not `publicJson` even though the catalog is the same for
 * everyone: this handler reads the session to decide whether to answer at all,
 * and a shared cache storing the 200 under this URL would hand it to a signed-
 * out visitor who should have got a 401.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);

    if (!user) {
      return errorJson("Unauthorized", 401);
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

    return privateJson({ providers, subjects }, { request, profile: CACHE.STATIC });
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Failed to load the published subject catalog.",
      500,
    );
  }
}
