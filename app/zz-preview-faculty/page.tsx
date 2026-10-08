"use client";
import { AdminFacultyOverview } from "@/components/admin-faculty-overview";
import { AdminFacultyActivity } from "@/components/admin-faculty-activity";

if (typeof window !== "undefined") {
  const now = Date.now();
  const at = (m: number) => new Date(now - m * 60000).toISOString();
  const entries = [
    { id: 9, action: "site.faculty_linked", summary: "Linked to subdomain License Preperation", createdAt: at(3), facultyId: "f", facultyName: "BCT/BEI Engineering Liscense", siteSlug: "license", actor: { userId: "a", fullName: "Suman Karki", email: "suman@example.com" }, details: {} },
    { id: 8, action: "subject.added", summary: "Added subject Control System", createdAt: at(90), facultyId: "f", facultyName: "BCT/BEI Engineering Liscense", siteSlug: null, actor: { userId: "b", fullName: "Prashant Soni", email: "p@example.com" }, details: { via: "creator workspace" } },
    { id: 7, action: "site.admin_added", summary: "Added a subdomain admin: Prashant Soni", createdAt: at(60 * 30), facultyId: null, facultyName: null, siteSlug: "license", actor: { userId: "a", fullName: "Suman Karki", email: "suman@example.com" }, details: {} },
    { id: 6, action: "student.faculty_changed", summary: "Moved a student from BEI to BCT/BEI Engineering Liscense", createdAt: at(60 * 50), facultyId: "f", facultyName: "x", siteSlug: "license", actor: { userId: "b", fullName: "Prashant Soni", email: "" }, details: {} },
    { id: 5, action: "subject.published", summary: "Published subject Electromagnetics", createdAt: at(60 * 24 * 4), facultyId: "f", facultyName: "x", siteSlug: null, actor: null, details: {} },
  ];
  window.fetch = async () => new Response(JSON.stringify({ entries, available: true }), { headers: { "content-type": "application/json" } });
}

export default function Preview() {
  return (
    <div className="mx-auto max-w-5xl bg-background p-6 text-foreground">
      <h1 className="font-display text-2xl font-semibold">BCT/BEI Engineering Liscense</h1>
      <AdminFacultyOverview
        faculty={{
          id: "f", slug: "bei-engineering-liscense", name: "BCT/BEI Engineering Liscense", shortName: "BEI", level: "License",
          status: "active", visibility: "public", createdAt: new Date().toISOString(), members: 42,
          subjects: { total: 6, published: 2, archived: 1 },
          sites: [{ slug: "license", name: "License Preperation", status: "live", examEnabled: false }],
          creator: { userId: "b", fullName: "Prashant Soni", email: "9165prashant@gmail.com", ambassador: true },
          siteAdmins: [{ userId: "c", fullName: "Aryog Sharma", email: "aryog@example.com", site: { slug: "license", name: "License Preperation" } }],
          superAdmins: [{ userId: "a", fullName: "Suman Karki", email: "" }, { userId: "d", fullName: "Aryog Sharma", email: "" }],
          contributors: [{ userId: "b", fullName: "Prashant Soni", email: "", subjectsAdded: 6, lastAt: new Date().toISOString() }],
        }}
      />
      <div className="mt-6"><AdminFacultyActivity facultySlug="x" /></div>
    </div>
  );
}
