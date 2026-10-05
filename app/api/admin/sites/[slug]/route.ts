import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { landingSiteErrorResponse } from "@/lib/admin/landing-site-response";
import { deleteLandingSite, getLandingSite, updateLandingSite } from "@/lib/data/landing-sites";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const site = await getLandingSite((await params).slug);
    if (!site) return NextResponse.json({ error: "That site doesn’t exist." }, { status: 404 });
    return NextResponse.json({ site });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t load the site.");
  }
}

/** Saves the draft, and/or renames, and/or shows or hides the site. */
export async function PATCH(request: Request, { params }: Context) {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await request.json().catch(() => null)) as {
    draft?: unknown;
    name?: unknown;
    status?: unknown;
    examConfig?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const status = body.status === "live" || body.status === "hidden" ? body.status : undefined;
  if (body.status !== undefined && !status) {
    return NextResponse.json({ error: "Status must be live or hidden." }, { status: 400 });
  }

  try {
    const site = await updateLandingSite(
      (await params).slug,
      {
        draft: body.draft,
        name: typeof body.name === "string" ? body.name : undefined,
        status,
        examConfig: body.examConfig,
      },
      access.userId,
    );
    return NextResponse.json({ site });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t save the site.");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    await deleteLandingSite((await params).slug);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return landingSiteErrorResponse(error, "Couldn’t delete the site.");
  }
}
