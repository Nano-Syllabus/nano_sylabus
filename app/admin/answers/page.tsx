import { AdminAnswersManager } from "@/components/admin-answers-manager";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminUser } from "@/lib/auth";
import { getAdminAnswerDetail, listAdminAnswers } from "@/lib/data/admin-answers";

export default async function AdminAnswersPage() {
  await requireAdminUser();
  const answers = await listAdminAnswers();
  const initialDetail = answers[0] ? await getAdminAnswerDetail(answers[0].messageId) : null;

  return (
    <AdminShell
      title="Answers"
      subtitle="Check student conversations, source matches, and flagged assistant answers from one place."
    >
      <AdminAnswersManager initialAnswers={answers} initialDetail={initialDetail} />
    </AdminShell>
  );
}
