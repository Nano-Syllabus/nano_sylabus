"use client";

import { useEffect, useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Workspace,
  interactive,
  text,
  responsePayload,
  initials,
} from "@/app/teachers-v2/workspace-shared";
import {
  inputClass,
} from "@/app/teachers-v2/views/workspace-view-shared";

export function TeacherSettingsView({
  teacher,
  onSaved,
}: {
  teacher: Workspace["teacher"];
  onSaved: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState(teacher.fullName);
  const [language, setLanguage] = useState<"EN" | "RN">(teacher.language);
  const [answerStyle, setAnswerStyle] = useState<"concise" | "exam_focused">(teacher.answerStyle);
  const [headline, setHeadline] = useState(teacher.publicProfile.headline);
  const [bio, setBio] = useState(teacher.publicProfile.bio);
  const [institution, setInstitution] = useState(teacher.publicProfile.institution);
  const [location, setLocation] = useState(teacher.publicProfile.location);
  const [expertise, setExpertise] = useState(teacher.publicProfile.expertise.join(", "));
  const [yearsExperience, setYearsExperience] = useState(
    String(teacher.publicProfile.yearsExperience || ""),
  );
  const [website, setWebsite] = useState(teacher.publicProfile.website);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(teacher.publicProfile.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!avatar) {
      setAvatarPreview(teacher.publicProfile.avatarUrl);
      return;
    }
    const preview = URL.createObjectURL(avatar);
    setAvatarPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [avatar, teacher.publicProfile.avatarUrl]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.set("fullName", fullName);
      form.set("language", language);
      form.set("answerStyle", answerStyle);
      form.set("headline", headline);
      form.set("bio", bio);
      form.set("institution", institution);
      form.set("location", location);
      form.set("expertise", expertise);
      form.set("yearsExperience", yearsExperience || "0");
      form.set("website", website);
      if (avatar) form.set("avatar", avatar);
      await responsePayload(
        await fetch("/api/teacher/preferences", {
          method: "PATCH",
          headers: { Accept: "application/json" },
          body: form,
        }),
      );
      await onSaved();
      setAvatar(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }

  const choiceClass = (active: boolean) =>
    cn(
      "min-h-11 rounded-lg px-4 text-sm font-medium",
      interactive,
      active ? "bg-text-primary text-text-inverse" : "border border-border text-text-secondary",
    );

  return (
    <form onSubmit={save} className="max-w-3xl">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">You</p>
      <h1 className="mt-3 font-display text-3xl font-semibold">Your Public Profile</h1>
      <p className="mt-2 text-text-secondary">
        Your public profile appears beside every course you publish.
      </p>
      <div className="mt-8 space-y-5">
        <section className="rounded-lg border border-border p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-bg-secondary">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreview}
                  alt="Teacher profile preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-display text-2xl font-semibold" aria-hidden="true">
                  {initials(fullName || teacher.handle)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold">Public teacher profile</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Give students enough context to trust the person behind the course.
              </p>
              <label
                htmlFor="teacher-avatar"
                className="mt-4 inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-bg-secondary"
              >
                {avatarPreview ? "Change photo" : "Add profile photo"}
              </label>
              <input
                id="teacher-avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (file && file.size > 5 * 1024 * 1024) {
                    setError("Profile photo must be 5 MB or smaller.");
                    event.target.value = "";
                    return;
                  }
                  setError("");
                  setAvatar(file);
                }}
              />
              <p className="mt-2 text-xs text-text-muted">JPG, PNG, or WebP · maximum 5 MB</p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="teacher-full-name" className="text-sm font-medium">
                Display name
              </label>
              <input
                id="teacher-full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                maxLength={120}
                autoComplete="name"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="teacher-headline" className="text-sm font-medium">
                Professional headline
              </label>
              <input
                id="teacher-headline"
                value={headline}
                onChange={(event) => setHeadline(event.target.value)}
                maxLength={120}
                placeholder="Computer Science educator"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="teacher-institution" className="text-sm font-medium">
                Institution
              </label>
              <input
                id="teacher-institution"
                value={institution}
                onChange={(event) => setInstitution(event.target.value)}
                maxLength={120}
                placeholder="Tribhuvan University"
                autoComplete="organization"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="teacher-location" className="text-sm font-medium">
                Location
              </label>
              <input
                id="teacher-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={100}
                placeholder="Kathmandu, Nepal"
                autoComplete="address-level2"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <label htmlFor="teacher-expertise" className="text-sm font-medium">
                Expertise
              </label>
              <input
                id="teacher-expertise"
                value={expertise}
                onChange={(event) => setExpertise(event.target.value)}
                maxLength={480}
                placeholder="Programming, Data Structures, C++"
                className={cn(inputClass, "mt-2")}
              />
              <p className="mt-2 text-xs text-text-muted">Separate up to 8 areas with commas.</p>
            </div>
            <div>
              <label htmlFor="teacher-experience" className="text-sm font-medium">
                Years of teaching
              </label>
              <input
                id="teacher-experience"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={yearsExperience}
                onChange={(event) =>
                  setYearsExperience(event.target.value.replace(/\D/g, "").slice(0, 2))
                }
                placeholder="5"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="teacher-website" className="text-sm font-medium">
                Website <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="teacher-website"
                type="url"
                inputMode="url"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                maxLength={240}
                placeholder="https://yourwebsite.com"
                autoComplete="url"
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="teacher-bio" className="text-sm font-medium">
                About you
              </label>
              <textarea
                id="teacher-bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={600}
                rows={5}
                placeholder="Tell students what you teach and how you help them prepare."
                className={cn(inputClass, "mt-2 min-h-32 py-3")}
              />
              <p className="mt-2 text-xs text-text-muted">{bio.length}/600 characters</p>
            </div>
          </div>
          <p className="mt-5 text-xs text-text-muted">Signed in as {teacher.email}</p>
        </section>
      </div>
      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        className="mt-6"
        type="submit"
        disabled={saving || !fullName.trim()}
        aria-busy={saving}
      >
        {saving ? "Saving profile…" : "Save profile"}
      </Button>
    </form>
  );
}
