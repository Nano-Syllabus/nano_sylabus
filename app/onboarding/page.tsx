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
  const { next } = await searchParams;
  const nextPath = sanitizeNextPath(next);
  redirect(nextPath || "/app/today");
}
