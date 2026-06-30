import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTenantEngineeringCatalog } from "@/lib/tenant/catalog";
import { getTenantSourceTree, listTenantNamespaces, listTenantSubjects } from "@/lib/tenant/client";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [namespaces, subjects, sourceTree] = await Promise.all([
      listTenantNamespaces(),
      listTenantSubjects(),
      getTenantSourceTree(),
    ]);

    const catalog = buildTenantEngineeringCatalog(sourceTree.tree ?? [], subjects);

    return NextResponse.json({
      namespaces:
        catalog.namespaces.length > 0
          ? catalog.namespaces
          : namespaces.map((namespace) => ({
              label: namespace.namespace,
              value: namespace.namespace_slug,
            })),
      faculties: catalog.faculties,
      levelsByFaculty: catalog.levelsByFaculty,
      branchesByPath: catalog.branchesByPath,
      semestersByPath: catalog.semestersByPath,
      subjectsByPath: catalog.subjectsByPath,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load tenant onboarding catalog.",
      },
      { status: 500 },
    );
  }
}
