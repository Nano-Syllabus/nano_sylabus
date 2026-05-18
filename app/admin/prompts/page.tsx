import { AdminPromptManager } from "@/components/admin-prompt-manager";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminUser } from "@/lib/auth";
import { listPromptTemplates } from "@/lib/data/admin-prompts";

export default async function AdminPromptsPage() {
  await requireAdminUser();
  const prompts = await listPromptTemplates();

  return (
    <AdminShell
      title="Prompt Control"
      subtitle="CRUD the runtime prompt layer. One active template per purpose and language will shape live student responses."
    >
      <AdminPromptManager initialPrompts={prompts} />
    </AdminShell>
  );
}
