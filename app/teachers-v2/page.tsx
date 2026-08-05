import { redirect } from "next/navigation";

export default async function TeachersV2Page({
  searchParams,
}: {
  searchParams: Promise<{ paper?: string }>;
}) {
  const paperId = (await searchParams).paper?.trim();
  redirect(paperId ? `/teachers?paper=${encodeURIComponent(paperId)}` : "/teachers");
}
