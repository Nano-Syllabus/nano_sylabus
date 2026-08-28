import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { AnalyticsUnavailableError, getAdminAnalytics } from "@/lib/data/admin-analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
  try {
    const access = await assertAdminRequest();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    return NextResponse.json(await getAdminAnalytics(), { headers });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof AnalyticsUnavailableError ? error.message : "Analytics are unavailable. Please retry.",
      setupRequired: error instanceof AnalyticsUnavailableError && error.setupRequired,
    }, { status: 503, headers });
  }
}
