import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublishedCatalog } from "@/lib/tenant/marketplace-catalog";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const catalog = await getPublishedCatalog();

    return NextResponse.json({
      providers: catalog.providers,
      subjects: catalog.subjects,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load the published subject catalog.",
      },
      { status: 500 },
    );
  }
}
