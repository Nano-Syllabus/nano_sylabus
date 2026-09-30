import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { getPlatformTokenUsage } from "@/lib/data/admin-token-usage";

export async function GET() {
  const access = await assertAdminRequest();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    return NextResponse.json(await getPlatformTokenUsage());
  } catch (error) {
    console.error("[admin/token-usage]", error);
    return NextResponse.json({ error: "Token usage couldn’t be loaded." }, { status: 502 });
  }
}
