import { NextResponse } from "next/server";
import { listPublishedCourses } from "@/lib/student-courses";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const courses = await listPublishedCourses();
    return NextResponse.json({ courses });
  } catch {
    return NextResponse.json({ error: "Could not load published courses." }, { status: 502 });
  }
}

