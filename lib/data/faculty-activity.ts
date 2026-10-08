import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { describeUsers } from "@/lib/data/admin-users";

/**
 * The faculty change log (`faculty_activity`).
 *
 * Writes never throw: a history row is a record of a change that already
 * happened, and a missing table (migration 20261008150000 not applied yet) or
 * a blip must not undo or fail the change itself. Subjects are logged by a
 * database trigger; everything else is logged here by the route that made it.
 */
export type FacultyActivityAction =
  | "faculty.created"
  | "faculty.updated"
  | "faculty.owner_changed"
  | "faculty.ambassador_added"
  | "faculty.ambassador_removed"
  | "faculty.deleted"
  | "subject.added"
  | "subject.updated"
  | "subject.published"
  | "site.faculty_linked"
  | "site.faculty_unlinked"
  | "site.admin_added"
  | "site.admin_removed"
  | "site.created"
  | "site.renamed"
  | "site.status_changed"
  | "site.published"
  | "site.deleted"
  | "student.faculty_changed";

export async function recordFacultyActivity(input: {
  actorId: string | null;
  action: FacultyActivityAction;
  summary: string;
  communityId?: string | null;
  communityName?: string | null;
  siteSlug?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    const { error } = await createSupabaseAdminClient()
      .from("faculty_activity")
      .insert({
        actor_id: input.actorId,
        action: input.action,
        summary: input.summary.slice(0, 500),
        community_id: input.communityId ?? null,
        community_name: input.communityName ?? null,
        site_slug: input.siteSlug ?? null,
        details: input.details ?? {},
      });
    if (error) console.error("[faculty-activity] not recorded", input.action, error.message);
  } catch (error) {
    console.error("[faculty-activity] not recorded", input.action, error);
  }
}

export type FacultyActivityEntry = {
  id: number;
  action: string;
  summary: string;
  createdAt: string;
  facultyId: string | null;
  facultyName: string | null;
  siteSlug: string | null;
  actor: { userId: string; fullName: string; email: string } | null;
  details: Record<string, unknown>;
};

/**
 * Newest first. `facultyIds`/`siteSlugs` narrow to an admin's scope (rows
 * matching either); omit both for everything (super admin).
 */
export async function listFacultyActivity(options: {
  facultyIds?: string[];
  siteSlugs?: string[];
  limit?: number;
  before?: number;
  showEmails: boolean;
}): Promise<{ entries: FacultyActivityEntry[]; available: boolean }> {
  let query = createSupabaseAdminClient()
    .from("faculty_activity")
    .select("id,action,summary,created_at,community_id,community_name,site_slug,actor_id,details")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 200));
  if (options.before) query = query.lt("id", options.before);
  if (options.facultyIds || options.siteSlugs) {
    const filters = [
      options.facultyIds?.length ? `community_id.in.(${options.facultyIds.join(",")})` : "",
      options.siteSlugs?.length
        ? // Site-wide rows only (admins, renames); a row about another faculty on
          // the same site belongs to that faculty.
          `and(site_slug.in.(${options.siteSlugs.map((slug) => `"${slug}"`).join(",")}),community_id.is.null)`
        : "",
    ].filter(Boolean);
    if (!filters.length) return { entries: [], available: true };
    query = query.or(filters.join(","));
  }
  const { data, error } = await query;
  if (error) {
    // PGRST205 / 42P01: the table is not there yet.
    if (error.code === "PGRST205" || error.code === "42P01") return { entries: [], available: false };
    throw error;
  }
  const rows = data ?? [];
  const people = await describeUsers(
    rows.flatMap((row) => [
      row.actor_id,
      typeof row.details?.userId === "string" ? row.details.userId : null,
    ]).filter((id): id is string => Boolean(id)),
  );
  const named = (userId: string) => {
    const person = people.get(userId);
    return {
      userId,
      fullName: person?.fullName || "Unknown",
      email: options.showEmails ? (person?.email ?? "") : "",
    };
  };
  return {
    available: true,
    entries: rows.map((row) => {
      const details = (row.details ?? {}) as Record<string, unknown>;
      // A row about a person (admin added, student moved) names them for the reader.
      const subject = typeof details.userId === "string" ? named(details.userId) : null;
      return {
        id: row.id,
        action: row.action,
        summary: subject && !details.userName ? `${row.summary}: ${subject.fullName}` : row.summary,
        createdAt: row.created_at,
        facultyId: row.community_id,
        facultyName: row.community_name,
        siteSlug: row.site_slug,
        actor: row.actor_id ? named(row.actor_id) : null,
        details,
      };
    }),
  };
}
