import { SignupPhoneForm } from "@/components/signup-phone-form";
import { requireAuthenticatedUser } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/post-auth";

export default async function SignupPhonePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await requireAuthenticatedUser();
  const { next } = await searchParams;

  return <SignupPhoneForm nextPath={sanitizeNextPath(next) ?? undefined} />;
}
