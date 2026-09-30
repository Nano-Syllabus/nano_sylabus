import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { landingSiteErrorResponse } from "@/lib/admin/landing-site-response";
import { publishLandingSite } from "@/lib/data/landing-sites";

/** Makes the draft live. The body may carry the latest draft, saved in the same write. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const access = await assertAdminRequest();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await request.json().catch(() => null)) as { draft?: unknown } | null;

  try {
    const site = await publishLandingSite((await params).slug, access.userId, body?.draft);
    return NextResponse.json({ site });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t publish the site.");
  }
}
