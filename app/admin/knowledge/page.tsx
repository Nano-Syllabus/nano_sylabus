import { AdminKnowledgeManager } from "@/components/admin-knowledge-manager";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminUser } from "@/lib/auth";
import { listAdminKnowledgeNotebooks } from "@/lib/data/admin-knowledge";

export default async function AdminKnowledgePage() {
  await requireAdminUser();
  const notebookPage = await listAdminKnowledgeNotebooks({ page: 1, pageSize: 50 });

  return (
    <AdminShell
      title="Notebooks"
      subtitle="Create notebooks by board, level, faculty, and subject. Then add syllabus, study material, and question bank resources under each notebook."
    >
      <AdminKnowledgeManager initialNotebooks={notebookPage.items} initialNotebookPage={notebookPage} />
    </AdminShell>
  );
}
