import { NextResponse } from "next/server";
import { assertScopedAdmin, outOfScope, scopeAllowsSite } from "@/lib/admin-scope";
import { landingSiteErrorResponse } from "@/lib/admin/landing-site-response";
import { recordFacultyActivity } from "@/lib/data/faculty-activity";
import { setLandingSiteIcon } from "@/lib/data/landing-sites";
import { isValidSiteSlug } from "@/lib/landing-site-host";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "landing-assets";
const MAX_BYTES = 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

type Context = { params: Promise<{ slug: string }> };

/**
 * The square image on a subdomain's Browse card (in place of "IOE", "LP").
 * Upload = stored and live at once; DELETE goes back to the initials.
 */
export async function POST(request: Request, { params }: Context) {
  const access = await assertScopedAdmin();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { slug } = await params;
  if (!isValidSiteSlug(slug)) return NextResponse.json({ error: "Unknown site." }, { status: 404 });
  if (!scopeAllowsSite(access.scope, slug)) return outOfScope("that subdomain");

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  const extension = EXTENSIONS[file.type];
  if (!extension) return NextResponse.json({ error: "Use a PNG, SVG, WebP or JPEG image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "The image must be 1 MB or smaller." }, { status: 400 });

  const path = `sites/${slug}/icon-${Date.now()}.${extension}`;
  const storage = createSupabaseAdminClient().storage.from(BUCKET);
  const { error } = await storage.upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    // Each upload has its own name, so the file itself never changes.
    cacheControl: "31536000",
  });
  if (error) {
    console.error("[admin/sites/icon]", error);
    return NextResponse.json({ error: "Couldn’t upload the image." }, { status: 500 });
  }

  try {
    const site = await setLandingSiteIcon(slug, storage.getPublicUrl(path).data.publicUrl, access.userId);
    await recordFacultyActivity({
      actorId: access.userId,
      action: "site.published",
      siteSlug: slug,
      summary: `Changed the card image of ${site.name}`,
    });
    return NextResponse.json({ iconUrl: site.content.brand.iconUrl });
  } catch (cause) {
    return landingSiteErrorResponse(cause, "Couldn’t save the image.");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await assertScopedAdmin();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { slug } = await params;
  if (!scopeAllowsSite(access.scope, slug)) return outOfScope("that subdomain");
  try {
    await setLandingSiteIcon(slug, "", access.userId);
    return NextResponse.json({ iconUrl: "" });
  } catch (cause) {
    return landingSiteErrorResponse(cause, "Couldn’t remove the image.");
  }
}
