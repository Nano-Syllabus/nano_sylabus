import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminPaymentConfig, saveAdminPaymentConfig } from "@/lib/data/admin-subscriptions";

const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null)
  .nullable();

function isPaymentImageUrl(value: string) {
  if (/[\\\s]/.test(value)) return false;
  // VPS uploads and bundled QR images use paths on the current site.
  if (value.startsWith("/") && !value.startsWith("//")) {
    return new URL(value, "https://payment.local").pathname !== "/";
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const configSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  bankName: optionalText,
  accountName: z.string().trim().min(1).max(160),
  accountNumber: optionalText,
  qrImageUrl: z.string().trim().min(1).max(1000).refine(isPaymentImageUrl),
  instructions: optionalText,
});

export async function GET() {
  const access = await assertAdminRequest();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    return NextResponse.json({ config: await getAdminPaymentConfig() });
  } catch (error) {
    console.error("[admin/payment-config]", error);
    return NextResponse.json({ error: "Could not load the payment QR." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = configSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const messages: Record<string, string> = {
      displayName: "Add a display name of 120 characters or fewer.",
      accountName: "Add an account name of 160 characters or fewer.",
      qrImageUrl: "Upload a QR image or use a valid image URL.",
      bankName: "Bank name must be 500 characters or fewer.",
      accountNumber: "Account number must be 500 characters or fewer.",
      instructions: "Instructions must be 500 characters or fewer.",
    };
    return NextResponse.json(
      { error: messages[String(field)] ?? "Send valid payment QR details." },
      { status: 400 },
    );
  }
  try {
    const config = await saveAdminPaymentConfig({
      ...parsed.data,
      bankName: parsed.data.bankName ?? null,
      accountNumber: parsed.data.accountNumber ?? null,
      instructions: parsed.data.instructions ?? null,
    });
    revalidatePath("/payment/[slug]", "page");
    return NextResponse.json({ config });
  } catch (error) {
    console.error("[admin/payment-config]", error);
    return NextResponse.json({ error: "Could not save the payment QR." }, { status: 500 });
  }
}
