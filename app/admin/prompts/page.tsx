import { AdminPromptManager } from "@/components/admin-prompt-manager";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminUser } from "@/lib/auth";
import { listPromptTemplates } from "@/lib/data/admin-prompts";

export default async function AdminPromptsPage() {
  await requireAdminUser();
  const prompts = await listPromptTemplates();

  return (
    <AdminShell
      title="AI Instructions"
      subtitle="Change the live AI instructions. One active template per purpose and language shapes student answers."
    >
      <AdminPromptManager initialPrompts={prompts} />
    </AdminShell>
  );
}
