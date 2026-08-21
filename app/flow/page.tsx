import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";
import { SaaSFlowClient } from "@/components/saas-flow-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nano Syllabus — Personalized Study System & Plans",
  description: "Answer a few quick questions to assess your study routine and unlock your personalized challenge path.",
};

export default async function FlowPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; retake?: string }>;
}) {
  const { user } = await getCurrentAuth().catch(() => ({ user: null }));
  const params = await searchParams;

  // If already logged in and not explicitly viewing pricing or retaking quiz, go straight to the app!
  if (user && !params.step && !params.retake) {
    redirect("/app/today");
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-primary" />}>
      <SaaSFlowClient
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
