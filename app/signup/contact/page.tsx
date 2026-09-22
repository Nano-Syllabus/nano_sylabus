import { AuthShell } from "@/components/auth-shell";
import { MarketingPhoneCaptureForm } from "@/components/marketing-phone-capture-form";
import { requireAuthenticatedUser } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/post-auth";

export default async function SignupContactPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await requireAuthenticatedUser();
  const { next } = await searchParams;

  return (
    <AuthShell
      title="One last step"
      subtitle="Add the number where you’d like to receive Nano Syllabus updates."
    >
      <MarketingPhoneCaptureForm nextPath={sanitizeNextPath(next) || "/app/today"} />
    </AuthShell>
  );
}
