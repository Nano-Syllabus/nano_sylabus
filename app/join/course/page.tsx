import type { Metadata } from "next";
import { CourseInviteCodeForm } from "@/components/course-invite-code-form";
import { LandingHeader } from "@/components/landing-header";

export const metadata: Metadata = {
  title: "Join a private course - nanosyllabus",
  description: "Join a nanosyllabus course with a private invitation code.",
  robots: { index: false, follow: false },
};

export default function CourseInviteCodePage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <LandingHeader />
      <CourseInviteCodeForm />
    </div>
  );
}
