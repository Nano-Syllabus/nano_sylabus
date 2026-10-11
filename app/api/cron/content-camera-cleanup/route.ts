import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cleanupContentCameras } from "@/lib/data/content-camera";

export const maxDuration = 120;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (
    !expected ||
    authorization.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await cleanupContentCameras(100);
    return NextResponse.json({ cleaned: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Camera cleanup could not be completed." }, { status: 503 });
  }
}
