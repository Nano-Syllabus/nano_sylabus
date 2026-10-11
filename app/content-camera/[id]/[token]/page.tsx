import type { Metadata } from "next";
import { MobileContentScanner } from "@/components/mobile-content-scanner";

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
      <MobileContentScanner phoneLink={{ id, token }} />
    </main>
  );
}
