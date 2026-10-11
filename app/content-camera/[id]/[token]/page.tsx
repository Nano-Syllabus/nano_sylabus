import type { Metadata } from "next";
import { ContentCameraUploader } from "@/components/content-camera-uploader";

export const metadata: Metadata = {
  title: "Scan content from your phone",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function ContentCameraPage({
  params,
}: {
  params: Promise<{ id: string; token: string }>;
}) {
  const { id, token } = await params;
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <h1 className="mb-5 text-2xl font-semibold">Capture content</h1>
      <ContentCameraUploader phoneLink={{ id, token }} />
    </main>
  );
}
