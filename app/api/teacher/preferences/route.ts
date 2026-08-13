import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileFromUser, teacherPublicProfileSchema } from "@/lib/teacher-public-profile";

const preferencesSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  language: z.enum(["EN", "RN"]),
  answerStyle: z.enum(["concise", "exam_focused"]),
});

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const avatarExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function PATCH(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await request.formData();
    const preferences = preferencesSchema.safeParse({
      fullName: form.get("fullName"),
      language: form.get("language"),
      answerStyle: form.get("answerStyle"),
    });
    const publicProfile = teacherPublicProfileSchema.safeParse({
      headline: form.get("headline") || "",
      bio: form.get("bio") || "",
      institution: form.get("institution") || "",
      location: form.get("location") || "",
      expertise: String(form.get("expertise") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      yearsExperience: Number(form.get("yearsExperience") || 0),
      website: form.get("website") || "",
    });
    if (!preferences.success) {
      return NextResponse.json({ error: "Enter a valid teacher name and preferences." }, { status: 400 });
    }
    if (!publicProfile.success) {
      return NextResponse.json(
        { error: publicProfile.error.issues[0]?.message || "Enter valid public profile details." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const teacherResult = await admin
      .from("teachers")
      .select("id,handle")
      .eq("user_id", user.id)
      .maybeSingle();
    if (teacherResult.error) throw teacherResult.error;
    if (!teacherResult.data) {
      return NextResponse.json({ error: "Teacher workspace not found." }, { status: 404 });
    }

    const existing = profileFromUser(user, teacherResult.data.handle);
    const avatar = form.get("avatar");
    let avatarPath = existing.avatarPath;
    let uploadedPath = "";
    if (avatar instanceof File && avatar.size > 0) {
      const extension = avatarExtensions[avatar.type];
      if (!extension) {
        return NextResponse.json({ error: "Profile photo must be a JPG, PNG, or WebP image." }, { status: 400 });
      }
      if (avatar.size > MAX_AVATAR_BYTES) {
        return NextResponse.json({ error: "Profile photo must be 5 MB or smaller." }, { status: 400 });
      }
      uploadedPath = `${teacherResult.data.id}/profile/avatar-${Date.now()}.${extension}`;
      const upload = await admin.storage.from("teacher-documents").upload(
        uploadedPath,
        Buffer.from(await avatar.arrayBuffer()),
        { contentType: avatar.type, upsert: false },
      );
      if (upload.error) throw upload.error;
      avatarPath = uploadedPath;
    }

    const nextProfile = {
      displayName: preferences.data.fullName,
      ...publicProfile.data,
      avatarPath,
    };
    const [{ error: authError }, { error: profileError }] = await Promise.all([
      admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          full_name: preferences.data.fullName,
          teacher_language: preferences.data.language,
          teacher_answer_style: preferences.data.answerStyle,
          teacher_public_profile: nextProfile,
        },
      }),
      admin
        .from("student_profiles")
        .update({ full_name: preferences.data.fullName, language_pref: preferences.data.language })
        .eq("user_id", user.id),
    ]);
    if (authError || profileError) {
      if (uploadedPath) await admin.storage.from("teacher-documents").remove([uploadedPath]);
      throw authError || profileError;
    }
    if (uploadedPath && existing.avatarPath && existing.avatarPath !== uploadedPath) {
      await admin.storage.from("teacher-documents").remove([existing.avatarPath]);
    }

    return NextResponse.json({
      preferences: preferences.data,
      publicProfile: nextProfile,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save teacher profile." },
      { status: 502 },
    );
  }
}
