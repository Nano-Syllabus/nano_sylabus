import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";

export const teacherPublicProfileSchema = z.object({
  headline: z.string().trim().max(120),
  bio: z.string().trim().max(600),
  institution: z.string().trim().max(120),
  location: z.string().trim().max(100),
  expertise: z.array(z.string().trim().min(1).max(60)).max(8),
  yearsExperience: z.number().int().min(0).max(60),
  website: z.union([z.literal(""), z.string().trim().url("Enter a valid website URL.").max(240)]),
});

export type TeacherPublicProfile = z.infer<typeof teacherPublicProfileSchema> & {
  displayName: string;
  avatarPath: string;
  avatarUrl: string;
  complete: boolean;
};

type MetadataProfile = Partial<Record<keyof TeacherPublicProfile, unknown>>;

export function profileFromUser(user: User | null, fallbackName: string): TeacherPublicProfile {
  const metadata = (user?.user_metadata?.teacher_public_profile || {}) as MetadataProfile;
  const displayName =
    stringValue(metadata.displayName) ||
    stringValue(user?.user_metadata?.full_name) ||
    fallbackName;
  const headline = stringValue(metadata.headline);
  const bio = stringValue(metadata.bio);
  const institution = stringValue(metadata.institution);
  const location = stringValue(metadata.location);
  const expertise = Array.isArray(metadata.expertise)
    ? metadata.expertise.map(stringValue).filter(Boolean).slice(0, 8)
    : [];
  const yearsExperience = Math.max(0, Math.min(60, Number(metadata.yearsExperience) || 0));
  const website = stringValue(metadata.website);
  const avatarPath = stringValue(metadata.avatarPath);

  return {
    displayName,
    headline,
    bio,
    institution,
    location,
    expertise,
    yearsExperience,
    website,
    avatarPath,
    avatarUrl: "",
    complete: Boolean(displayName && headline && bio && institution && expertise.length && avatarPath),
  };
}

export async function withTeacherAvatar(
  admin: SupabaseClient,
  profile: TeacherPublicProfile,
): Promise<TeacherPublicProfile> {
  if (!profile.avatarPath) return profile;
  const signed = await admin.storage
    .from("teacher-documents")
    .createSignedUrl(profile.avatarPath, 60 * 60);
  return { ...profile, avatarUrl: signed.data?.signedUrl || "" };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
