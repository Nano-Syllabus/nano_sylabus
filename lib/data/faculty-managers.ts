import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { describeUsers } from "@/lib/data/admin-users";
import { ensureCommunityLearningSpace } from "@/lib/community-learning";
import { CommunityError, PUBLIC_COMMUNITIES_MEMO } from "@/lib/data/communities";
import { invalidateMemo } from "@/lib/http/memo";
import { invalidateStudentCourseAccess } from "@/lib/student-courses";
import { addStudentAmbassador } from "@/lib/data/student-ambassadors";

export type FacultyManager = {
  userId: string;
  fullName: string;
  /** Empty unless a super admin is looking (user, 2026-10-08). */
  email: string;
  /**
   * "admin" runs a subdomain that lists the faculty; "creator" made the faculty;
   * "ambassador" is one of the faculty's student ambassadors (one or more).
   */
  role: "admin" | "creator" | "ambassador";
  /** The subdomain an admin manages it through. */
  site: { slug: string; name: string } | null;
  ambassador: boolean;
};

export type FacultyManagement = {
  id: string;
  slug: string;
  name: string;
  status: string;
  members: number;
  sites: Array<{ slug: string; name: string }>;
  managers: FacultyManager[];
};

/**
 * Who manages each faculty: the admins of every subdomain that lists it, and the
 * person who created it (flagged when they are a student ambassador). Super
 * admins manage everything and are not listed per faculty. `onlyIds` narrows
 * the list to an admin's reach (lib/admin-scope.ts).
 */
export async function listFacultyManagement(options: {
  showEmails: boolean;
  onlyIds?: string[];
}): Promise<FacultyManagement[]> {
  const admin = createSupabaseAdminClient();
  const [faculties, links, siteAdmins, sites, ambassadors, facultyAmbassadors] = await Promise.all([
    admin.from("communities").select("id,slug,name,status,creator_id").order("name"),
    admin.from("landing_exam_faculties").select("exam_slug,community_id").eq("is_active", true),
    admin.from("landing_site_admins").select("site_slug,user_id").order("assigned_at"),
    admin.from("landing_sites").select("slug,name"),
    admin.from("student_ambassadors").select("email"),
    admin.from("faculty_ambassadors").select("community_id,user_id").order("added_at"),
  ]);
  for (const result of [faculties, links, sites]) if (result.error) throw result.error;
  // These tables may lag a migration; read them as empty rather than fail.
  const adminRows = siteAdmins.error ? [] : (siteAdmins.data ?? []);
  const facultyAmbassadorRows = facultyAmbassadors.error ? [] : (facultyAmbassadors.data ?? []);
  const ambassadorEmails = new Set(
    (ambassadors.error ? [] : (ambassadors.data ?? [])).map((row) => row.email.toLowerCase()),
  );

  const siteName = new Map((sites.data ?? []).map((site) => [site.slug, site.name as string]));
  const sitesByFaculty = new Map<string, string[]>();
  for (const link of links.data ?? [])
    sitesByFaculty.set(link.community_id, [
      ...(sitesByFaculty.get(link.community_id) ?? []),
      link.exam_slug,
    ]);

  let rows = faculties.data ?? [];
  if (options.onlyIds) {
    const allowed = new Set(options.onlyIds);
    rows = rows.filter((row) => allowed.has(row.id));
  }

  const people = await describeUsers([
    ...adminRows.map((row) => row.user_id),
    ...rows.map((row) => row.creator_id).filter(Boolean),
    ...facultyAmbassadorRows.map((row) => row.user_id),
  ]);
  const memberCounts = await Promise.all(
    rows.map((row) =>
      admin
        .from("community_memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("community_id", row.id)
        .eq("status", "active")
        .then((result) => result.count ?? 0),
    ),
  );

  const person = (userId: string) => {
    const known = people.get(userId);
    return {
      userId,
      fullName: known?.fullName ?? "Unknown",
      email: options.showEmails ? (known?.email ?? "") : "",
      ambassador: Boolean(known?.email && ambassadorEmails.has(known.email.toLowerCase())),
    };
  };

  return rows.map((row, index) => {
    const siteSlugs = sitesByFaculty.get(row.id) ?? [];
    const managers: FacultyManager[] = adminRows
      .filter((adminRow) => siteSlugs.includes(adminRow.site_slug))
      .map((adminRow) => ({
        ...person(adminRow.user_id),
        role: "admin" as const,
        site: { slug: adminRow.site_slug, name: siteName.get(adminRow.site_slug) ?? adminRow.site_slug },
      }));
    if (row.creator_id && !managers.some((manager) => manager.userId === row.creator_id))
      managers.push({ ...person(row.creator_id), role: "creator", site: null });
    for (const ambassadorRow of facultyAmbassadorRows)
      if (ambassadorRow.community_id === row.id)
        managers.push({ ...person(ambassadorRow.user_id), role: "ambassador", site: null, ambassador: true });
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      members: memberCounts[index],
      sites: siteSlugs.map((slug) => ({ slug, name: siteName.get(slug) ?? slug })),
      managers,
    };
  });
}

export type FacultyPerson = { userId: string; fullName: string; email: string };

/** One faculty, everyone with a hand in it, and what each of them may do. */
export type FacultyOverview = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  level: string;
  status: string;
  visibility: string;
  createdAt: string;
  members: number;
  subjects: { total: number; published: number; archived: number };
  sites: Array<{ slug: string; name: string; status: string; examEnabled: boolean }>;
  creator: (FacultyPerson & { ambassador: boolean }) | null;
  siteAdmins: Array<FacultyPerson & { site: { slug: string; name: string } }>;
  superAdmins: FacultyPerson[];
  /** People who actually added or published subjects, from the change log. */
  contributors: Array<FacultyPerson & { subjectsAdded: number; lastAt: string }>;
};

export async function getFacultyOverview(
  slug: string,
  options: { showEmails: boolean },
): Promise<FacultyOverview | null> {
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("communities")
    .select("id,slug,name,faculty,level,status,visibility,creator_id,created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const [links, subjects, members, superAdmins, ambassadors, activity] = await Promise.all([
    admin
      .from("landing_exam_faculties")
      .select("exam_slug,landing_sites!inner(name,status,exam_config)")
      .eq("community_id", row.id)
      .eq("is_active", true),
    admin.from("community_subjects").select("status,publication_status").eq("community_id", row.id),
    admin
      .from("community_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("community_id", row.id)
      .eq("status", "active"),
    admin.from("student_profiles").select("user_id").eq("role", "super_admin"),
    admin.from("student_ambassadors").select("email"),
    admin
      .from("faculty_activity")
      .select("actor_id,action,created_at")
      .eq("community_id", row.id)
      .in("action", ["subject.added", "subject.published", "subject.updated"])
      .not("actor_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  for (const result of [links, subjects, members, superAdmins]) if (result.error) throw result.error;

  const sites = (links.data ?? []).map((link) => {
    const site = (Array.isArray(link.landing_sites) ? link.landing_sites[0] : link.landing_sites) as {
      name: string;
      status: string;
      exam_config: { enabled?: boolean } | null;
    };
    return {
      slug: link.exam_slug as string,
      name: site.name,
      status: site.status,
      examEnabled: Boolean(site.exam_config?.enabled),
    };
  });
  const siteAdminRows = sites.length
    ? await admin
        .from("landing_site_admins")
        .select("site_slug,user_id")
        .in(
          "site_slug",
          sites.map((site) => site.slug),
        )
    : { data: [], error: null };
  const adminRows = siteAdminRows.error ? [] : (siteAdminRows.data ?? []);

  const contributions = new Map<string, { subjectsAdded: number; lastAt: string }>();
  for (const entry of activity.error ? [] : (activity.data ?? [])) {
    const current = contributions.get(entry.actor_id) ?? { subjectsAdded: 0, lastAt: entry.created_at };
    if (entry.action === "subject.added") current.subjectsAdded += 1;
    contributions.set(entry.actor_id, current);
  }

  const people = await describeUsers([
    ...(row.creator_id ? [row.creator_id] : []),
    ...adminRows.map((adminRow) => adminRow.user_id),
    ...(superAdmins.data ?? []).map((profile) => profile.user_id),
    ...contributions.keys(),
  ]);
  const person = (userId: string): FacultyPerson => {
    const known = people.get(userId);
    return {
      userId,
      fullName: known?.fullName ?? "Unknown",
      email: options.showEmails ? (known?.email ?? "") : "",
    };
  };
  const ambassadorEmails = new Set(
    (ambassadors.error ? [] : (ambassadors.data ?? [])).map((entry) => entry.email.toLowerCase()),
  );
  const subjectRows = subjects.data ?? [];

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.faculty ?? "",
    level: row.level ?? "",
    status: row.status,
    visibility: row.visibility,
    createdAt: row.created_at,
    members: members.count ?? 0,
    subjects: {
      total: subjectRows.filter((subject) => subject.status === "active").length,
      published: subjectRows.filter(
        (subject) => subject.status === "active" && subject.publication_status === "published",
      ).length,
      archived: subjectRows.filter((subject) => subject.status !== "active").length,
    },
    sites,
    creator: row.creator_id
      ? {
          ...person(row.creator_id),
          ambassador: Boolean(
            people.get(row.creator_id)?.email &&
              ambassadorEmails.has(people.get(row.creator_id)!.email.toLowerCase()),
          ),
        }
      : null,
    siteAdmins: adminRows.map((adminRow) => ({
      ...person(adminRow.user_id),
      site: {
        slug: adminRow.site_slug,
        name: sites.find((site) => site.slug === adminRow.site_slug)?.name ?? adminRow.site_slug,
      },
    })),
    superAdmins: (superAdmins.data ?? []).map((profile) => person(profile.user_id)),
    contributors: [...contributions.entries()]
      .map(([userId, stats]) => ({ ...person(userId), ...stats }))
      .sort((a, b) => b.subjectsAdded - a.subjectsAdded || b.lastAt.localeCompare(a.lastAt)),
  };
}

/**
 * A super admin hands a faculty to a new creator directly — no emailed accept
 * link (that is the creator's own transfer, lib/data/community-ownership-transfer.ts).
 * Mirrors `accept_community_ownership_transfer`: the new creator gets a creator
 * membership; the old one stays on as a member, or leaves if they already study
 * in another faculty (one active member faculty per student).
 */
export async function setFacultyCreator(facultySlug: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: faculty, error } = await admin
    .from("communities")
    .select("id,creator_id")
    .eq("slug", facultySlug)
    .maybeSingle();
  if (error) throw error;
  if (!faculty) throw new CommunityError("Faculty not found.", 404);
  const previous = faculty.creator_id ? String(faculty.creator_id) : null;
  if (previous === userId) return;

  const { data: profile, error: profileError } = await admin
    .from("student_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new CommunityError("That person has no account.", 404);

  const moved = await admin
    .from("communities")
    .update({ creator_id: userId, updated_at: new Date().toISOString() })
    .eq("id", faculty.id);
  if (moved.error) throw moved.error;

  const now = new Date().toISOString();
  const joined = await admin.from("community_memberships").upsert(
    {
      community_id: faculty.id,
      user_id: userId,
      role: "creator",
      status: "active",
      left_at: null,
      updated_at: now,
    },
    { onConflict: "community_id,user_id" },
  );
  if (joined.error) throw joined.error;

  if (previous) {
    const { data: elsewhere } = await admin
      .from("community_memberships")
      .select("community_id")
      .eq("user_id", previous)
      .eq("role", "member")
      .eq("status", "active")
      .neq("community_id", faculty.id)
      .limit(1);
    const demoted = await admin
      .from("community_memberships")
      .update(
        elsewhere?.length
          ? { role: "member", status: "left", left_at: now, updated_at: now }
          : { role: "member", updated_at: now },
      )
      .eq("community_id", faculty.id)
      .eq("user_id", previous);
    if (demoted.error) console.error("[faculty-managers] old creator kept the creator row", demoted.error);
  }

  invalidateMemo(PUBLIC_COMMUNITIES_MEMO);
  invalidateStudentCourseAccess(userId);
  // The new creator's teacher collection and study course, as creating a faculty
  // does. Best effort: ownership has moved, and the workspace provisions on visit.
  try {
    await ensureCommunityLearningSpace(admin, String(faculty.id));
  } catch (provisionError) {
    console.error("[faculty-managers] provisioning the new creator failed", provisionError);
  }
}

/**
 * Make someone one of a faculty's ambassadors (a faculty may have several), or
 * take them off it. Adding also puts their email on the global ambassador list
 * so they can open the Student Ambassador workspace; removing leaves that list
 * alone (they may be an ambassador elsewhere — the checkbox clears it).
 */
export async function setFacultyAmbassador(input: {
  facultySlug: string;
  userId: string;
  actorUserId: string;
  action: "add" | "remove";
}) {
  const admin = createSupabaseAdminClient();
  const { data: faculty, error } = await admin
    .from("communities")
    .select("id,name")
    .eq("slug", input.facultySlug)
    .maybeSingle();
  if (error) throw error;
  if (!faculty) throw new CommunityError("Faculty not found.", 404);

  if (input.action === "remove") {
    const removed = await admin
      .from("faculty_ambassadors")
      .delete()
      .eq("community_id", faculty.id)
      .eq("user_id", input.userId);
    if (removed.error) throw removed.error;
    return { facultyId: String(faculty.id), facultyName: String(faculty.name) };
  }

  const person = (await describeUsers([input.userId])).get(input.userId);
  if (!person?.email) throw new CommunityError("That person has no account.", 404);
  const added = await admin.from("faculty_ambassadors").upsert(
    { community_id: faculty.id, user_id: input.userId, added_by: input.actorUserId },
    { onConflict: "community_id,user_id", ignoreDuplicates: true },
  );
  if (added.error) {
    if (added.error.code === "42P01" || added.error.code === "PGRST205")
      throw new CommunityError(
        "Faculty ambassadors need the Supabase migration 20261008160000_faculty_ambassadors.sql.",
        503,
      );
    throw added.error;
  }
  await addStudentAmbassador(person.email, input.actorUserId);
  return { facultyId: String(faculty.id), facultyName: String(faculty.name), person };
}
