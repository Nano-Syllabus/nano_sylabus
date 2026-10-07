import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSuperAdminRequest } from "@/lib/admin-access";
import { AdminRoleError, listSiteAdmins, setSiteAdmin } from "@/lib/data/admin-users";

type Context = { params: Promise<{ slug: string }> };

const bodySchema = z.object({ userId: z.string().uuid().nullable() });

/**
 * Set who runs this subdomain site, or nobody (`userId: null`). Super admins
 * only: it changes a person's access. The admin being replaced goes back to
 * student (see `setSiteAdmin`).
 */
export async function PUT(request: Request, { params }: Context) {
  const access = await assertSuperAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a person." }, { status: 400 });
  try {
    const { slug } = await params;
    if (parsed.data.userId === access.userId)
      return NextResponse.json({ error: "You can’t change your own access." }, { status: 409 });
    await setSiteAdmin({ actorUserId: access.userId, siteSlug: slug, userId: parsed.data.userId });
    return NextResponse.json({ admin: (await listSiteAdmins()).get(slug) ?? null });
  } catch (error) {
    if (error instanceof AdminRoleError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The site’s admin could not be changed." },
      { status: 500 },
    );
  }
}
