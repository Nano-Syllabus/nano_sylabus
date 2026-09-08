import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SubjectExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string }>;
}) {
  const params = await searchParams;
  const query = params.community
    ? `?community=${encodeURIComponent(params.community)}`
    : "";
  redirect(`/app/chat${query}`);
}
