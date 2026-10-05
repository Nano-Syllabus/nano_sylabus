import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { getPlatformTokenUsage, type UsageRange } from "@/lib/data/admin-token-usage";

export async function GET(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access)
    return NextResponse.json({ error: access.error }, { status: access.status });

  const requested = new URL(request.url).searchParams.get("range");
  const range: UsageRange = requested === "7d" || requested === "30d" ? requested : "all";

  try {
    return NextResponse.json(await getPlatformTokenUsage(range));
  } catch (error) {
    console.error("[admin/token-usage]", error);
    return NextResponse.json({ error: "Token usage couldn’t be loaded." }, { status: 502 });
  }
}
