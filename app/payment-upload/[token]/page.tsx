import { MobileReceiptUpload } from "@/components/mobile-receipt-upload";

export default async function PaymentUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <MobileReceiptUpload token={token} />;
}
