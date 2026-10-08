import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { listAdminSites, listStudentExamEnrollments, type FacultyRef } from "@/lib/data/faculty-lock";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * What one admin may reach — the tenancy line of the admin panel.
 *
 * - A super admin reaches every subdomain, faculty and student.
 * - An admin runs ONE subdomain (`landing_site_admins`) and reaches that site,
 *   its faculties (`landing_exam_faculties`), the faculties they created
 *   themselves, and the students enrolled through the site or in one of those
 *   faculties. With no site assigned they reach only what they created.
 *
 * Every /api/admin route that names a site, faculty or student checks here,
 * not just "is this an admin" — that check alone let the admin of one
 * subdomain edit, publish or delete another.
 */
export type AdminScope =
  | { all: true; userId: string; role: "super_admin" }
  | {
      all: false;
      userId: string;
      role: "admin";
      site: { slug: string; name: string } | null;
      /** The site's faculties plus the ones this admin created. */
      faculties: FacultyRef[];
    };

export async function getAdminScope(access: {
  userId: string;
  role: "admin" | "super_admin";
}): Promise<AdminScope> {
  if (access.role === "super_admin") return { all: true, userId: access.userId, role: "super_admin" };
  const [sites, created] = await Promise.all([
    listAdminSites([access.userId]),
    createSupabaseAdminClient()
      .from("communities")
      .select("id,slug,name")
      .eq("creator_id", access.userId),
  ]);
  if (created.error) throw created.error;
  const site = sites.get(access.userId) ?? null;
  const faculties = [...(site?.faculties ?? [])];
  for (const row of (created.data ?? []) as FacultyRef[])
    if (!faculties.some((faculty) => faculty.id === row.id)) faculties.push(row);
  return {
    all: false,
    userId: access.userId,
    role: "admin",
    site: site ? { slug: site.slug, name: site.name } : null,
    faculties,
  };
}

export type ScopedAdminAccess = {
  userId: string;
  role: "admin" | "super_admin";
  scope: AdminScope;
};

/** `assertAdminRequest` plus the scope, in one call for route handlers. */
export async function assertScopedAdmin(): Promise<
  ScopedAdminAccess | { error: string; status: number }
> {
  const access = await assertAdminRequest();
  if ("error" in access && access.error) return { error: access.error, status: access.status };
  const { userId, role } = access as { userId: string; role: "admin" | "super_admin" };
  try {
    return { userId, role, scope: await getAdminScope({ userId, role }) };
  } catch {
    return { error: "Unable to verify admin access", status: 503 };
  }
}

/** The site filter for site-owned rows: undefined = all, a slug, or null = none. */
export function scopeSite(scope: AdminScope): string | null | undefined {
  return scope.all ? undefined : (scope.site?.slug ?? null);
}

export function scopeAllowsSite(scope: AdminScope, slug: string) {
  return scope.all || scope.site?.slug === slug;
}

export function scopeAllowsFaculty(scope: AdminScope, target: { id?: string; slug?: string }) {
  if (scope.all) return true;
  return scope.faculties.some(
    (faculty) =>
      (target.id !== undefined && faculty.id === target.id) ||
      (target.slug !== undefined && faculty.slug === target.slug),
  );
}

/** A student is in an admin's scope through their site enrollment or a scoped faculty membership. */
export async function scopeAllowsUser(scope: AdminScope, userId: string) {
  if (scope.all) return true;
  if (userId === scope.userId) return true;
  const enrollments = await listStudentExamEnrollments(userId);
  if (scope.site && enrollments.some((enrollment) => enrollment.examSlug === scope.site!.slug))
    return true;
  if (!scope.faculties.length) return false;
  const { count, error } = await createSupabaseAdminClient()
    .from("community_memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active")
    .in(
      "community_id",
      scope.faculties.map((faculty) => faculty.id),
    );
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Everyone an admin may see in the Students list: students enrolled through
 * their site, members of their faculties, the site's other admins, and
 * themselves. Null for a super admin (no filter).
 */
export async function listScopedUserIds(scope: AdminScope): Promise<Set<string> | null> {
  if (scope.all) return null;
  const admin = createSupabaseAdminClient();
  const ids = new Set<string>([scope.userId]);
  const [enrolled, members, admins] = await Promise.all([
    scope.site
      ? admin.from("student_exam_enrollments").select("user_id").eq("exam_slug", scope.site.slug)
      : null,
    scope.faculties.length
      ? admin
          .from("community_memberships")
          .select("user_id")
          .eq("status", "active")
          .in(
            "community_id",
            scope.faculties.map((faculty) => faculty.id),
          )
      : null,
    scope.site
      ? admin.from("landing_site_admins").select("user_id").eq("site_slug", scope.site.slug)
      : null,
  ]);
  for (const result of [enrolled, members, admins]) {
    if (!result) continue;
    if (result.error) throw result.error;
    for (const row of result.data ?? []) ids.add(row.user_id as string);
  }
  return ids;
}

export function outOfScope(what = "that") {
  return NextResponse.json(
    { error: `You can only manage ${what} on your own subdomain.` },
    { status: 403 },
  );
}

export function superAdminOnly(action: string) {
  return NextResponse.json({ error: `Only a super admin can ${action}.` }, { status: 403 });
}
