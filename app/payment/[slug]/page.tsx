import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/post-auth";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export default async function PublicPaymentBridge({ params }: PageProps) {
  const { slug } = await params;
  const destination = sanitizeNextPath(`/app/payment/${slug}`) || "/app/courses";
  const { user } = await getCurrentAuth();

  if (!user) redirect(`/login?next=${encodeURIComponent(destination)}`);
  if (!user.onboarded) redirect(`/onboarding?next=${encodeURIComponent(destination)}`);
  redirect(destination);
}
