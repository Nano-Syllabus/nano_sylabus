import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "landing-assets";
const MAX_BYTES = 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

/** Stores a payment QR image and returns its public URL; it goes live when the config is saved. */
export async function POST(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  const extension = EXTENSIONS[file.type];
  if (!extension) return NextResponse.json({ error: "Use a PNG, WebP or JPEG image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "The QR image must be 1 MB or smaller." }, { status: 400 });

  const path = `payment/qr-${Date.now()}.${extension}`;
  const storage = createSupabaseAdminClient().storage.from(BUCKET);
  const { error } = await storage.upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    cacheControl: "31536000",
  });
  if (error) {
    console.error("[admin/payment-config/qr]", error);
    return NextResponse.json({ error: "Couldn’t upload the QR image." }, { status: 500 });
  }
  return NextResponse.json({ url: storage.getPublicUrl(path).data.publicUrl });
}
