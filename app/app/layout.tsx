import { AppShell } from "@/components/app-shell";
import { requireOnboardedUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireOnboardedUser();

  return (
    <AppShell user={user} title="">
      {children}
    </AppShell>
  );
}
