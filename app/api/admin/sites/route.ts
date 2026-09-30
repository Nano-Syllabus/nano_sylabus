import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { landingSiteErrorResponse } from "@/lib/admin/landing-site-response";
import { createLandingSite, listLandingSites } from "@/lib/data/landing-sites";

export async function GET() {
  const access = await assertAdminRequest();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    return NextResponse.json({ sites: await listLandingSites() });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t load the sites.");
  }
}

export async function POST(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await request.json().catch(() => null)) as
    | { slug?: unknown; name?: unknown; copyFrom?: unknown }
    | null;
  if (!body || typeof body.slug !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: "A subdomain and a name are required." }, { status: 400 });
  }

  try {
    const site = await createLandingSite({
      slug: body.slug,
      name: body.name,
      copyFrom: typeof body.copyFrom === "string" ? body.copyFrom : undefined,
      userId: access.userId,
    });
    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t create the site.");
  }
}
