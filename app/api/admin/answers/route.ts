import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { listAdminAnswers } from "@/lib/data/admin-answers";
import type { AdminAnswerFilter } from "@/lib/types";

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseStatus(value: string | null): AdminAnswerFilter {
  if (value === "flagged" || value === "reviewed" || value === "liked" || value === "neutral" || value === "all") {
    return value;
  }
  return "flagged";
}

export async function GET(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const result = await listAdminAnswers({
      q: searchParams.get("q") ?? undefined,
      status: parseStatus(searchParams.get("status")),
      page: parsePositiveInt(searchParams.get("page"), 1),
      pageSize: parsePositiveInt(searchParams.get("pageSize"), 50),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load AI answers." },
      { status: 500 },
    );
  }
}
