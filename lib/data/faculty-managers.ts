import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { describeUsers } from "@/lib/data/admin-users";

export type FacultyManager = {
  userId: string;
  fullName: string;
  /** Empty unless a super admin is looking (user, 2026-10-08). */
  email: string;
  /** "admin" runs a subdomain that lists the faculty; "creator" made the faculty. */
  role: "admin" | "creator";
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
  const [faculties, links, siteAdmins, sites, ambassadors] = await Promise.all([
    admin.from("communities").select("id,slug,name,status,creator_id").order("name"),
    admin.from("landing_exam_faculties").select("exam_slug,community_id").eq("is_active", true),
    admin.from("landing_site_admins").select("site_slug,user_id").order("assigned_at"),
    admin.from("landing_sites").select("slug,name"),
    admin.from("student_ambassadors").select("email"),
  ]);
  for (const result of [faculties, links, sites]) if (result.error) throw result.error;
  // These two tables may lag a migration; read them as empty rather than fail.
  const adminRows = siteAdmins.error ? [] : (siteAdmins.data ?? []);
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
