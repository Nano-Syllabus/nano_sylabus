import { AdminAnswersManager } from "@/components/admin-answers-manager";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminUser } from "@/lib/auth";
import { getAdminAnswerDetail, listAdminAnswers } from "@/lib/data/admin-answers";

export default async function AdminAnswersPage() {
  await requireAdminUser();
  const answerPage = await listAdminAnswers({ page: 1, pageSize: 50, status: "flagged" });
  const initialDetail = answerPage.items[0] ? await getAdminAnswerDetail(answerPage.items[0].messageId) : null;

  return (
    <AdminShell
      title="Answers"
      subtitle="Check student conversations, source matches, and flagged assistant answers from one place."
    >
      <AdminAnswersManager initialAnswers={answerPage.items} initialDetail={initialDetail} initialPage={answerPage} />
    </AdminShell>
  );
}
