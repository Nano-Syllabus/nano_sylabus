import { NextResponse } from "next/server";
import { assertSuperAdminRequest } from "@/lib/admin-access";
import { listSiteAdminChoices } from "@/lib/data/admin-users";

/** Every subdomain site and who runs it — the super admin's picker when making an admin. */
export async function GET() {
  const access = await assertSuperAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  try {
    return NextResponse.json({ sites: await listSiteAdminChoices() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Subdomains could not be loaded." },
      { status: 500 },
    );
  }
}
