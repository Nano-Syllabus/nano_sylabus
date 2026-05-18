import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminKnowledgeSourceSignedUrl } from "@/lib/data/admin-knowledge";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { documentId } = await params;
    const { searchParams } = new URL(request.url);
    const signedUrl = await getAdminKnowledgeSourceSignedUrl(documentId, {
      download: searchParams.get("download") === "1",
    });

    if (!signedUrl) {
      return NextResponse.json({ error: "Original source file not found." }, { status: 404 });
    }

    return NextResponse.redirect(signedUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to open source file." },
      { status: 500 },
    );
  }
}
