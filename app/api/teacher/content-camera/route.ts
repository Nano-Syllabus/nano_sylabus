import { after, NextResponse } from "next/server";
import { getWorkspaceTeacher } from "@/app/teachers/actions";
import { validateDestination } from "@/lib/teacher-document-import";
import {
  cleanupContentCameras,
  contentCameraState,
  createContentCamera,
  ContentCameraError,
} from "@/lib/data/content-camera";

export async function POST(request: Request) {
  try {
    const teacher = await getWorkspaceTeacher();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const input = await request.json();
    const path = typeof input.path === "string" ? input.path : "";
    const error = await validateDestination(teacher.collection_sk, path);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const { session, token } = await createContentCamera(teacher.id, path);
    after(() => cleanupContentCameras().catch(() => undefined));
    return NextResponse.json(
      {
        ...(await contentCameraState(session)),
        token,
        uploadPath: `/content-camera/${session.id}/${token}`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof ContentCameraError ? cause.message : "Could not open the camera upload.",
      },
      { status: cause instanceof ContentCameraError ? cause.status : 500 },
    );
  }
}
