import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import {
  clearFinishedDriveImports,
  listDriveImports,
  retryDriveImports,
} from "@/lib/data/teacher-drive-queue";
import { drainDriveQueue } from "@/lib/teacher-drive-drain";

/**
 * The Drive import queue: read it, and drain it.
 *
 * GET  — what the dialog polls. Queued, importing, done and failed, newest first.
 * POST `retry` — put failed rows back on the queue. A row is a complete
 *        instruction, so this needs nothing from the dialog that queued it.
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

  const input = (await request.json().catch(() => ({}))) as {
    action?: string;
    failed?: boolean;
    ids?: unknown;
  };
  if (input.action === "clear") {
    await clearFinishedDriveImports(teacher.id, Boolean(input.failed));
    const { items } = await listDriveImports(teacher.id);
    return NextResponse.json({ items });
  }

  /**
   * Retry: failed rows go back to `queued` and a drain is started behind the
   * response.
   *
   * The two failures this exists for — an index that timed out, and a worker cut
   * short mid-import — say nothing about the file, only about the run. Before
   * this the only way to have another go was to find the link again and paste it
   * back in, which is not something a creator can do from the Activity page, and
   * not something they can do at all for a folder link they no longer have.
   */
  if (input.action === "retry") {
    const ids = Array.isArray(input.ids)
      ? input.ids.filter((value): value is string => typeof value === "string")
      : [];
    const { retried, unavailable } = await retryDriveImports(teacher.id, ids);
    if (unavailable) {
      return NextResponse.json(
        {
          error:
            "The import queue is not available on this deployment. Run the latest database migration.",
        },
        { status: 503 },
      );
    }
    // Fire-and-forget, like the enqueue: the rows are durable the moment they
    // are back on `queued`, and the panel's own polling starts another drain if
    // this one never runs. Awaiting it would hold the response for the length of
    // the import the creator just asked to happen in the background.
    if (retried) {
      void drainDriveQueue(teacher.collection_sk, teacher.id).catch((cause) => {
        console.error("Drive queue drain (retry) error:", cause);
      });
    }
    const { items } = await listDriveImports(teacher.id);
    return NextResponse.json({ items, retried });
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
