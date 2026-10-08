import { NextResponse } from "next/server";
import { contentDisposition } from "@/lib/http/content-disposition";
import { communityStorageError } from "@/lib/data/communities";
import { getCommunityPostAttachment } from "@/lib/data/community-subjects";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

type RouteContext = { params: Promise<{ postId: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
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
        "Content-Disposition": contentDisposition("inline", attachment.name, "community-resource"),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
