import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";
import { studyFlowDestination } from "@/lib/study-diagnostic";
import { SaaSFlowClient } from "@/components/saas-flow-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nano Syllabus — Personalized Study System & Plans",
  description: "Answer a few quick questions to assess your study routine and unlock your personalized challenge path.",
};

export default async function FlowPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string | string[] }>;
}) {
  const [params, { user, studyDiagnosticCompleted }] = await Promise.all([
    searchParams,
    getCurrentAuth().catch(() => ({ user: null, studyDiagnosticCompleted: false })),
  ]);
  const community = typeof params.community === "string" ? params.community : undefined;
  const completionDestination = studyFlowDestination(community);

  // The account's saved answers apply to every community and every device.
  if (user && studyDiagnosticCompleted) redirect(completionDestination);

  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-primary" />}>
      <SaaSFlowClient
        completionDestination={completionDestination}
        initialUser={
          user
            ? {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
              }
            : null
        }
      />
    </Suspense>
  );
}
