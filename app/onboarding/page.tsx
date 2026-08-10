import { redirect } from "next/navigation";
import { Logo } from "@/components/marketing-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { OnboardingForm } from "@/components/onboarding-form";
import { requireAuthenticatedUser } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/post-auth";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { user, profile } = await requireAuthenticatedUser();
  const { next } = await searchParams;
  const nextPath = sanitizeNextPath(next);

  if (user.onboarded) {
    redirect(nextPath || "/app/today");
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-primary text-text-primary">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <Logo />
        <ThemeToggle />
      </header>
      <OnboardingForm
        userId={user.id}
        initialProfile={profile}
        initialName={user.fullName}
        nextPath={nextPath || undefined}
      />
    </div>
  );
}
