import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { listAdminAnswers } from "@/lib/data/admin-answers";

export async function GET() {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const answers = await listAdminAnswers();
    return NextResponse.json({ answers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load AI answers." },
      { status: 500 },
    );
  }
}
