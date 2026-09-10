import { AppShell } from "@/components/app-shell";
import { QueryIdentity } from "@/components/query-identity";
import { TabWarmer } from "@/components/tab-warmer";
import { requireOnboardedUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireOnboardedUser();

  return (
    <AppShell user={user} title="">
      {/* Clears the query cache if a different account signs in on this
          browser. See components/query-identity.tsx — the cache is keyed by
          endpoint, and the endpoint does not change when the cookie does. */}
      <QueryIdentity userId={user.id} />
      {/* Renders the other tabs on the server while this one is being read, so
          the first click on each is an in-memory read rather than a wait.
          See components/tab-warmer.tsx. */}
      <TabWarmer />
      {children}
    </AppShell>
  );
}
