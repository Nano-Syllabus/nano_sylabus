import { NextResponse } from "next/server";
import {
  indexAllTeacherDocumentsAction,
  rotateTeacherCollectionKeyAction,
} from "@/app/teachers/actions";

type ApiRecord = Record<string, unknown>;

function jobId(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const result = value as ApiRecord;
  if (typeof result.job_id === "string") return result.job_id;
  if (result.job && typeof result.job === "object") {
    const job = result.job as ApiRecord;
    if (typeof job.job_id === "string") return job.job_id;
    if (typeof job.id === "string") return job.id;
  }
  return typeof result.id === "string" ? result.id : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      confirmation?: unknown;
    } | null;

    if (body?.action === "index-all") {
      const result = await indexAllTeacherDocumentsAction();
      return NextResponse.json({ queued: true, jobId: jobId(result) });
    }

    if (body?.action === "rotate-key") {
      if (body.confirmation !== "ROTATE") {
        return NextResponse.json({ error: "Type ROTATE to confirm key rotation." }, { status: 400 });
      }
      await rotateTeacherCollectionKeyAction();
      return NextResponse.json({ rotated: true });
    }

    return NextResponse.json({ error: "Unknown collection action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Collection action failed.";
    const unauthorized = /not authorized|logged in|unauthorized/i.test(message);
    return NextResponse.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : message.includes("could not be saved")
            ? "The key rotated but could not be saved. Contact an administrator immediately."
            : "Could not update the teacher collection.",
      },
      { status: unauthorized ? 401 : 502 },
    );
  }
}
