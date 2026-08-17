import { NextResponse } from "next/server";
import { z } from "zod";
import { handleMcqSetCheck } from "../check-set-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const requestSchema = z.object({ setId: z.string().trim().min(1) }).passthrough();

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    return handleMcqSetCheck(payload.setId, payload);
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || "Invalid MCQ set."
      : "Could not read this MCQ submission.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
