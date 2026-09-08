import { CACHE, errorJson, publicJson } from "@/lib/http/cache";
import { listPublishedCourses } from "@/lib/student-courses";

export const dynamic = "force-dynamic";

/**
 * The public course list, for the marketing and enrol pages.
 *
 * The one route in this tree that is genuinely `publicJson`: it reads no
 * session, and its answer is identical for a signed-out visitor, a student and
 * a crawler. So a CDN or a proxy in front of the app may hold it, which is
 * what `public, max-age=1800, stale-while-revalidate=3600` asks for — a cold
 * landing page then costs zero origin requests for this list.
 */
export async function GET(request: Request) {
  try {
    const courses = await listPublishedCourses();
    return publicJson({ courses }, { request, profile: CACHE.STATIC });
  } catch {
    return errorJson("Could not load published courses.", 502);
  }
}

