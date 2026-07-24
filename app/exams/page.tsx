import { ExamBackButton } from "@/components/exam-back-button";
import { ExamPracticeClient } from "@/components/exam-practice-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { requireOnboardedUser } from "@/lib/auth";
import { listTenantSubjects } from "@/lib/tenant/client";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const { user } = await requireOnboardedUser();
  let subjects: Array<{ name: string; namespace: string; chunkCount: number }> = [];
  let subjectLoadError = "";

  try {
    const tenantSubjects = await listTenantSubjects();
    subjects = tenantSubjects.map((subject) => ({
      name: subject.name,
      namespace: subject.namespace,
      chunkCount: subject.chunk_count,
    }));
  } catch (error) {
    subjectLoadError =
      error instanceof Error ? error.message : "The tenant subject API did not respond.";
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg-primary text-text-primary">
      <header className="sticky top-0 z-30 border-b border-border bg-bg-primary/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <ExamBackButton />
            <span aria-hidden="true" className="h-5 w-px bg-border" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Nano Syllabus</p>
              <p className="truncate text-xs text-text-muted">Exam workspace</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={user.creditBalance > 0 ? "success" : "warning"}
              className="hidden sm:inline-flex"
            >
              {user.creditBalance} messages
            </Badge>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <ExamPracticeClient subjects={subjects} subjectLoadError={subjectLoadError} />
    </div>
  );
}
