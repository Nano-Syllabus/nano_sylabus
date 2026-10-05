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
const configSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  bankName: optionalText,
  accountName: z.string().trim().min(1).max(160),
  accountNumber: optionalText,
  qrImageUrl: z.string().trim().url().max(1000),
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
  if (!parsed.success)
    return NextResponse.json(
      { error: "Add a display name, account name and the QR image." },
      { status: 400 },
    );
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
