import { completeContribution, listPendingContributions, drainContributions } from "@/lib/data/material-contribution-queue";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  ContributionError,
  prepareContribution,
} from "@/lib/data/material-contributions";
import { getStudentCourseSubjectAccessCached } from "@/lib/student-courses";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { withUsageCommunity } from "@/lib/usage-community";

export const dynamic = "force-dynamic";
// The response only queues a saved file. after() runs a bounded background drain.
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"),
    subject: z.string().trim().min(1).max(200),
    courseId: z.string().trim().max(200).optional(),
    fileName: z.string().trim().min(1).max(300),
    sizeBytes: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("complete"),
    subject: z.string().trim().min(1).max(200),
    courseId: z.string().trim().max(200).optional(),
    fileName: z.string().trim().min(1).max(300),
    storagePath: z.string().trim().min(1).max(600),
  }),
]);

/** Bounds clicking, not spending: each file is one model call over 3 pages. */
const WINDOW_MS = 60 * 60_000;
const PER_WINDOW = 20;
const recent = new Map<string, number[]>();

/** This student's files for the subject that are still being checked. */
async function handleGET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  const params = new URL(request.url).searchParams;
  const subject = params.get("subject")?.trim() || "";
  if (!subject) return NextResponse.json({ pending: [] }, { headers: NO_STORE });
  const access = await getStudentCourseSubjectAccessCached(
    user.id,
    params.get("courseId")?.trim() || null,
    subject,
  ).catch(() => null);
  if (!access) return NextResponse.json({ pending: [] }, { headers: NO_STORE });
  after(() => drainContributions(user.id).catch((error) => console.error("Contribution recovery failed", error)));
  return NextResponse.json(
    { pending: await listPendingContributions(user.id, access) },
    { headers: NO_STORE },
  );
}

/**
 * A student adds a PDF to a subject's Learning Resources: `prepare` hands back a
 * signed upload URL, `complete` triages the uploaded file and, if it belongs to
 * the subject, indexes it for the community. See lib/data/material-contributions.ts.
 */
async function handlePOST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose a PDF to upload." }, { status: 400, headers: NO_STORE });
    }
    const input = parsed.data;

    const access = await getStudentCourseSubjectAccessCached(user.id, input.courseId || null, input.subject);
    if (!access) {
      return NextResponse.json(
        { error: "Join this subject's community to add resources." },
        { status: 403, headers: NO_STORE },
      );
    }

    if (input.action === "prepare") {
      const now = Date.now();
      const asked = (recent.get(user.id) ?? []).filter((at) => now - at < WINDOW_MS);
      if (asked.length >= PER_WINDOW) {
        return NextResponse.json(
          { error: "That's a lot of uploads for one hour. Try again later." },
          { status: 429, headers: NO_STORE },
        );
      }
      recent.set(user.id, [...asked, now]);
      if (recent.size > 5000) recent.delete(recent.keys().next().value as string);
      return NextResponse.json(
        await prepareContribution(user.id, access, input.fileName, input.sizeBytes),
        { headers: NO_STORE },
      );
    }

    const verdict = await completeContribution(user.id, access, {
      storagePath: input.storagePath,
      fileName: input.fileName,
    });
    after(() => drainContributions(user.id).catch((error) => console.error("Contribution worker failed", error)));
    return NextResponse.json(verdict, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ContributionError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    }
    console.warn("[materials] contribution failed", error);
    return NextResponse.json(
      { error: "The upload couldn't be finished. Try again shortly." },
      { status: 502, headers: NO_STORE },
    );
  }
}

// Tokens these spend are counted against the student's faculty (lib/usage-community.ts).
export const GET = withUsageCommunity(handleGET);
export const POST = withUsageCommunity(handlePOST);
