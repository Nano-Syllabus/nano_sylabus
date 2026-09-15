import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { clearFinishedDriveImports, listDriveImports } from "@/lib/data/teacher-drive-queue";
import { drainDriveQueue } from "@/lib/teacher-drive-drain";

/**
 * The Drive import queue: read it, and drain it.
 *
 * GET  — what the dialog polls. Queued, importing, done and failed, newest first.
 * POST — do the next item, then the next, until the queue is empty or the clock
 *        runs out. Fire-and-forget: the enqueue call kicks this off and does not
 *        wait for it, and the browser learns the outcome from GET.
 *
 * WHY A DRAIN ENDPOINT AND NOT A WORKER PROCESS
 * ---------------------------------------------
 * There is no long-lived process to put a worker in — this deploys as serverless
 * functions. So the queue is drained by an ordinary request that happens to be
 * nobody's page load. Enqueuing starts one; polling starts one if the queue has
 * work and nothing is currently on it. Either way the creator's dialog is not
 * the thing doing the importing, which is the property that was missing.
 *
 * Draining is therefore at-least-once and possibly concurrent. That is handled
 * where it has to be — in `claim_teacher_drive_import`, which hands one row to
 * one worker — rather than by assuming only one drain is ever in flight.
 */

export const maxDuration = 300;

export async function GET() {
  const teacher = await getTeacherProfile();
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { items, unavailable } = await listDriveImports(teacher.id);
  return NextResponse.json({
    items,
    unavailable,
    pending: items.filter((item) => item.status === "queued" || item.status === "importing").length,
  });
}

export async function POST(request: Request) {
  const teacher = await getTeacherProfile();
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const input = (await request.json().catch(() => ({}))) as { action?: string; failed?: boolean };
  if (input.action === "clear") {
    await clearFinishedDriveImports(teacher.id, Boolean(input.failed));
    const { items } = await listDriveImports(teacher.id);
    return NextResponse.json({ items });
  }

  try {
    const result = await drainDriveQueue(teacher.collection_sk, teacher.id);
    return NextResponse.json(result);
  } catch (cause) {
    // A drain that dies has still written every outcome it reached, and the rows
    // it did not reach are still queued for the next one. So this is reported,
    // not retried here.
    console.error("Drive queue drain error:", cause);
    return NextResponse.json({ error: "The import queue could not be drained." }, { status: 500 });
  }
}
