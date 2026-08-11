import { redirect } from "next/navigation";
type PageProps = { params: Promise<{ slug: string }> };

export default async function LegacyPublicEnrollBridge({ params }: PageProps) {
  const { slug } = await params;
  redirect(`/app/payment/${encodeURIComponent(slug)}`);
}
