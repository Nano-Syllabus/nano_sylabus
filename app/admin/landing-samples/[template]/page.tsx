import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LandingPreview } from "@/components/landing-preview";
import { assertAdminRequest } from "@/lib/admin-access";
import { isLandingTemplateId } from "@/lib/landing-content";
import { createLandingTemplate } from "@/lib/landing-templates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Landing page sample · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

export default async function LandingSamplePage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  if (!isLandingTemplateId(template)) notFound();
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401)
      redirect(`/login?next=${encodeURIComponent(`/admin/landing-samples/${template}`)}`);
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }
  return <LandingPreview initialContent={createLandingTemplate(template)} editable={false} />;
}
