import { NextResponse } from "next/server";
import { CACHE, privateJson } from "@/lib/http/cache";
import { communityInputSchema } from "@/lib/communities";
import { getPhoneNumberError, normalizePhoneNumber } from "@/lib/phone-number";
import {
  communityStorageError,
  createCommunity,
  listPublicCommunities,
} from "@/lib/data/communities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    const communities = await listPublicCommunities(user?.id);
    return privateJson({ communities }, { request, profile: CACHE.SHORT });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user)
      return NextResponse.json({ error: "Sign in to Create a faculty." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = communityInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Check the community details and try again.",
          field: parsed.error.issues[0]?.path[0] || null,
        },
        { status: 400 },
      );
    }

    const rawPhone = typeof body?.phoneNumber === "string" ? body.phoneNumber : "";
    const phoneError = getPhoneNumberError(rawPhone);
    if (phoneError) {
      return NextResponse.json({ error: phoneError, field: "phoneNumber" }, { status: 400 });
    }

    // Stored on the creator's profile, the same place Settings keeps it: the
    // metadata write is synced to student_profiles by the signup-phone trigger.
    const phoneNumber = normalizePhoneNumber(rawPhone);
    if (user.user_metadata?.phone_number !== phoneNumber) {
      const saved = await supabase.auth.updateUser({ data: { phone_number: phoneNumber } });
      if (saved.error) {
        return NextResponse.json(
          { error: "Could not save your phone number. Try again.", field: "phoneNumber" },
          { status: 400 },
        );
      }
    }

    const community = await createCommunity(user.id, parsed.data);
    return NextResponse.json({ community }, { status: 201 });
  } catch (error) {
    const mapped = communityStorageError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
