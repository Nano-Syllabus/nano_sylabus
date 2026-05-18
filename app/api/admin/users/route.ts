import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { listAdminUsers } from "@/lib/data/admin-users";

export async function GET(request: Request) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const users = await listAdminUsers({
      q: searchParams.get("q") ?? undefined,
    });
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load users." },
      { status: 500 },
    );
  }
}
