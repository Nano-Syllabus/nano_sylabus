import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listTenantSubjects } from "@/lib/tenant/client";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subjects = await listTenantSubjects();

    return NextResponse.json({
      subjects: subjects.map((subject) => ({
        name: subject.name,
        slug: subject.slug,
        namespaceSlug: subject.namespace_slug,
        folderPath: subject.folder_path,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load tenant subjects.",
      },
      { status: 500 },
    );
  }
}
