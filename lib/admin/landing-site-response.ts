import { NextResponse } from "next/server";
import { LandingSiteError } from "@/lib/data/landing-sites";

/** A landing-site failure as JSON: its own message and status when it is ours, a plain one otherwise. */
export function landingSiteErrorResponse(error: unknown, fallback: string) {
  if (error instanceof LandingSiteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[admin/sites]", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
