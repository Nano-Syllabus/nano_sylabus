import { NextResponse } from "next/server";
import { z } from "zod";
import { CommunityError } from "@/lib/data/communities";
import { TeacherApiError } from "@/lib/teacher-app/client";

export function facultyErrorResponse(error: unknown) {
  if (error instanceof z.ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message || "Check the faculty details." },
      { status: 400 },
    );
  if (error instanceof CommunityError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof TeacherApiError && error.status === 409)
    return NextResponse.json({ error: error.message }, { status: 409 });
  if ((error as { code?: string })?.code === "23505")
    return NextResponse.json(
      {
        error:
          "That subject is already attached. Restore its existing entry or choose another name.",
      },
      { status: 409 },
    );
  console.error(
    "Admin faculty operation failed",
    error instanceof Error ? error.message : (error as { code?: string })?.code,
  );
  return NextResponse.json(
    { error: "Could not save faculty details. Please retry." },
    { status: 502 },
  );
}
export function invalidFacultyOrigin(request: Request) {
  return (
    request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin
  );
}
