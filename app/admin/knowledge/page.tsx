import { AdminKnowledgeManager } from "@/components/admin-knowledge-manager";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminUser } from "@/lib/auth";
import { listAdminKnowledgeDocuments } from "@/lib/data/admin-knowledge";

export default async function AdminKnowledgePage() {
  await requireAdminUser();
  const documents = await listAdminKnowledgeDocuments();

  return (
    <AdminShell
      title="Knowledge Base"
      subtitle="Structure documents by board, grade, faculty, curriculum, and type. Then chunk and vectorize them for grounded retrieval."
    >
      <AdminKnowledgeManager initialDocuments={documents} />
    </AdminShell>
  );
}
