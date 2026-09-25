import type { Metadata } from "next";
import { MobileAnswerSheetUpload } from "@/components/mobile-answer-sheet-upload";

export const metadata: Metadata = {
  title: "Upload answer sheet",
  // A bearer link: never indexed, never sent onward as a referrer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AnswerSheetUploadPage({ params }: { params: Promise<{ challengeId: string; token: string }> }) {
  const { challengeId, token } = await params;
  return <MobileAnswerSheetUpload challengeId={challengeId} token={token} />;
}
