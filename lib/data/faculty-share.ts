import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * A faculty is run by its creator AND its faculty ambassadors (user, 2026-10-09):
 * everyone listed on /admin/faculties shares the faculty's subjects and files.
 * Deleting the faculty and handing it over stay with the creator.
 */

/** The faculty ids this user is an ambassador of (not the ones they created). */
export async function listAmbassadorFacultyIds(
  userId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<string[]> {
  // Fails closed: an unreadable table (or one lagging its migration) means
  // nobody is an ambassador, never that everybody is.
  try {
    const result = await admin.from("faculty_ambassadors").select("community_id,user_id").eq("user_id", userId);
    if (result.error || !Array.isArray(result.data)) return [];
    return result.data
      .filter((row) => String(row.user_id) === userId)
      .map((row) => String(row.community_id));
  } catch {
    return [];
  }
}

export async function isFacultyAmbassador(
  userId: string,
  communityId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<boolean> {
  try {
    const result = await admin
      .from("faculty_ambassadors")
      .select("community_id,user_id")
      .eq("community_id", communityId)
      .eq("user_id", userId)
      .maybeSingle();
    const row = result.data as { community_id?: unknown; user_id?: unknown } | null;
    return (
      !result.error &&
      String(row?.user_id ?? "") === userId &&
      String(row?.community_id ?? "") === communityId
    );
  } catch {
    return false;
  }
}

/** Creator or faculty ambassador: may edit the faculty's subjects, files and posts. */
export async function mayManageFaculty(
  userId: string | null | undefined,
  community: { id: string; creator_id: string | null },
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<boolean> {
  if (!userId) return false;
  if (String(community.creator_id || "") === userId) return true;
  return isFacultyAmbassador(userId, String(community.id), admin);
}
