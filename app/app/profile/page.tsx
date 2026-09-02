import { Award, BookOpenCheck, Building2, Trophy } from "lucide-react";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { getCommunityLearningProfile } from "@/lib/data/community-profile";

export const dynamic = "force-dynamic";

export default async function LearningProfilePage() {
  const { user } = await requireOnboardedUser();
  const profile = await getCommunityLearningProfile(user.id);
  const measuredTopics = profile.topics.strong + profile.topics.developing + profile.topics.weak;
  const strongPercent = measuredTopics ? Math.round((profile.topics.strong / measuredTopics) * 100) : 0;
  const cards = [
    { label: "Total XP", value: profile.xp, Icon: Award },
    { label: "Challenges completed", value: profile.completedChallenges, Icon: Trophy },
    { label: "Topics mastered", value: profile.topics.strong, Icon: BookOpenCheck },
    { label: "Communities", value: profile.joinedCommunities, Icon: Building2 },
  ];
  return (
    <>
      <SetAppShell title="Learning profile" />
      <main className="w-full max-w-[1050px] px-4 pb-24 pt-6 lg:p-7">
        <header>
          <p className="text-sm text-text-secondary">{user.fullName}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Your learning profile</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">XP grows from completed challenges. Topics turn green as your graded answers reach strong mastery.</p>
        </header>
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Learning totals">
          {cards.map(({ label, value, Icon }) => <article key={label} className="rounded-xl border border-border bg-bg-primary p-5"><Icon className="size-5 text-text-muted" aria-hidden="true" /><p className="mt-5 font-display text-3xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-sm text-text-secondary">{label}</p></article>)}
        </section>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-xl border border-border bg-bg-primary p-5" aria-labelledby="mastery-title">
            <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-widest text-text-muted">Topic progress</p><h2 id="mastery-title" className="mt-2 font-display text-xl font-semibold">Mastery map</h2></div><p className="text-2xl font-semibold tabular-nums">{strongPercent}%</p></div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-bg-secondary"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${strongPercent}%` }} /></div>
            <dl className="mt-6 grid grid-cols-3 gap-3 text-center"><div className="rounded-lg bg-emerald-500/10 p-3"><dt className="text-xs text-emerald-700">Strong</dt><dd className="mt-1 text-xl font-semibold">{profile.topics.strong}</dd></div><div className="rounded-lg bg-bg-secondary p-3"><dt className="text-xs text-text-muted">Developing</dt><dd className="mt-1 text-xl font-semibold">{profile.topics.developing}</dd></div><div className="rounded-lg bg-bg-secondary p-3"><dt className="text-xs text-text-muted">Needs work</dt><dd className="mt-1 text-xl font-semibold">{profile.topics.weak}</dd></div></dl>
          </section>
          <section className="rounded-xl border border-border bg-bg-primary p-5" aria-labelledby="xp-title"><h2 id="xp-title" className="font-display text-xl font-semibold">Recent XP</h2><div className="mt-4 divide-y divide-border">{profile.recentXp.map((event) => <div key={event.id} className="flex items-center gap-3 py-3"><span className="flex size-9 items-center justify-center rounded-full bg-bg-secondary text-xs font-semibold">+{event.points}</span><div className="min-w-0"><p className="text-sm font-medium">{event.reason}</p><p className="mt-0.5 text-xs text-text-muted">{new Date(event.createdAt).toLocaleDateString()}</p></div></div>)}{!profile.recentXp.length ? <p className="py-8 text-center text-sm text-text-muted">Complete your first challenge to earn 50 XP.</p> : null}</div></section>
        </div>
      </main>
    </>
  );
}
