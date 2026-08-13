import { redirect } from "next/navigation";
type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export default async function CoursePaymentPage({ params }: PageProps) {
  const { slug } = await params;
  redirect(`/payment/${encodeURIComponent(slug)}`);
}
