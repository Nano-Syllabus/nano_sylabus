import { NextResponse } from "next/server";
import { getCurrentAuth } from "@/lib/auth";
import { getEnrollmentExam } from "@/lib/data/exam-enrollment";
import { hasJoinedFaculty } from "@/lib/data/faculty-lock";
import { EXAM_SITE_COOKIE } from "@/lib/exam-enrollment";
import { mainAppOrigin } from "@/lib/landing-site-host";

export const dynamic = "force-dynamic";

/**
 * "Continue learning" on an exam's subdomain. Everyone uses the same app; this
 * only decides how they get in:
 *
 * - signed out → log in (or sign up) and come back here;
 * - already joined a faculty → the app, which opens that faculty;
 * - new → the app, where the faculty picker shows only this exam's faculties
 *   (and asks its questions). Study tools are visible; opening them asks for a plan.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const here = `/prepare/${encodeURIComponent(slug)}`;
  // Sign-in lives on the main domain; a subdomain never sees that session.
  const appOrigin = mainAppOrigin(request.headers.get("host"));
  if (appOrigin) return NextResponse.redirect(`${appOrigin}${here}`);

  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  const exam = await getEnrollmentExam(slug);
  if (!exam) return to("/");

  const { user } = await getCurrentAuth();
  if (!user) return to(`/login?next=${encodeURIComponent(here)}`);
  if (await hasJoinedFaculty(user.id)) return to("/app/challenges");

  const response = to("/app/challenges");
  response.cookies.set(EXAM_SITE_COOKIE, exam.slug, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
