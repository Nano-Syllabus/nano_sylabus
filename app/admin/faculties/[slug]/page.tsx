import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminBillingFrame, AdminPageHeader } from "@/components/admin-billing-frame";
import { AdminFacultyActivity } from "@/components/admin-faculty-activity";
import { AdminFacultyOverview } from "@/components/admin-faculty-overview";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminScope, scopeAllowsFaculty } from "@/lib/admin-scope";
import { getFacultyOverview } from "@/lib/data/faculty-managers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Faculty · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

export default async function AdminFacultyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401)
      redirect(`/login?next=${encodeURIComponent(`/admin/faculties/${slug}`)}`);
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }
  const scope = await getAdminScope(access);
  if (!scopeAllowsFaculty(scope, { slug })) redirect("/admin/faculties");

  const faculty = await getFacultyOverview(slug, { showEmails: scope.all });
  if (!faculty) notFound();

  return (
    <AdminBillingFrame active="faculties">
      <Link
        href="/admin/faculties"
        className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} aria-hidden="true" /> All faculties
      </Link>
      <AdminPageHeader
        title={faculty.name}
        description={[
          faculty.shortName,
          faculty.level,
          faculty.status !== "active" ? faculty.status : "",
          faculty.visibility !== "public" ? faculty.visibility : "",
          `created ${new Date(faculty.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/admin/users?faculty=${encodeURIComponent(faculty.slug)}`}
          className="inline-flex min-h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
        >
          See its students
        </Link>
      </div>
      <AdminFacultyOverview faculty={faculty} />
      <div className="mt-6">
        <AdminFacultyActivity facultySlug={faculty.slug} />
      </div>
    </AdminBillingFrame>
  );
}
