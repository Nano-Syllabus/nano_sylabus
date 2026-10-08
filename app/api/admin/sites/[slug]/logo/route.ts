import { NextResponse } from "next/server";
import { assertScopedAdmin, outOfScope, scopeAllowsSite } from "@/lib/admin-scope";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidSiteSlug, MAIN_SITE_SLUG } from "@/lib/landing-site-host";

const BUCKET = "landing-assets";
const MAX_BYTES = 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

/**
 * Stores a site's logo and returns its public URL. The URL only goes live
 * when the editor saves it into the draft and the draft is published.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const access = await assertScopedAdmin();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!scopeAllowsSite(access.scope, (await params).slug)) return outOfScope("that subdomain");

  const { slug } = await params;
  if (slug !== MAIN_SITE_SLUG && !isValidSiteSlug(slug)) {
    return NextResponse.json({ error: "Unknown site." }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  const extension = EXTENSIONS[file.type];
  if (!extension) return NextResponse.json({ error: "Use a PNG, SVG, WebP or JPEG image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "The logo must be 1 MB or smaller." }, { status: 400 });

  const path = `sites/${slug}/logo-${Date.now()}.${extension}`;
  const storage = createSupabaseAdminClient().storage.from(BUCKET);
  const { error } = await storage.upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    // Each upload has its own name, so the file itself never changes.
    cacheControl: "31536000",
  });
  if (error) {
    console.error("[admin/sites/logo]", error);
    return NextResponse.json({ error: "Couldn’t upload the logo." }, { status: 500 });
  }

  return NextResponse.json({ url: storage.getPublicUrl(path).data.publicUrl });
}
