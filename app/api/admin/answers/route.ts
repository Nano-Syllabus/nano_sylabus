import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { parseAdminListQuery } from "@/lib/admin/list-query";
import { parseAnswerFilter } from "@/lib/admin/schemas";
import { listAdminAnswers } from "@/lib/data/admin-answers";

export async function GET(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = parseAdminListQuery(searchParams);
    const result = await listAdminAnswers({
      q: query.q,
      status: parseAnswerFilter(searchParams.get("status")),
      page: query.page,
      pageSize: query.pageSize,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load AI answers." },
      { status: 500 },
    );
  }
}
