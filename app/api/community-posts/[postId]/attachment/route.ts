import { NextResponse } from "next/server";
import { communityStorageError } from "@/lib/data/communities";
import { getCommunityPostAttachment } from "@/lib/data/community-subjects";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ postId: string }> };

export const dynamic = "force-dynamic";

function safeFileName(value: string) {
  return value.replace(/["\\\r\n]/g, "_").slice(0, 180) || "community-resource";
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to open this file." }, { status: 401 });

    const { postId } = await context.params;
    const attachment = await getCommunityPostAttachment(user.id, postId);
    const admin = createSupabaseAdminClient();
    const download = await admin.storage.from(attachment.bucket).download(attachment.path);
    if (download.error || !download.data) {
      throw download.error || new Error("The contribution file is unavailable.");
    }

    return new NextResponse(new Uint8Array(await download.data.arrayBuffer()), {
      headers: {
        "Content-Type": attachment.mimeType || download.data.type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeFileName(attachment.name)}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
