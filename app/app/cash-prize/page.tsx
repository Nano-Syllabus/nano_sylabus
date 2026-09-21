import { CashPrizeCampaign } from "@/components/cash-prize-campaign";
import {
  cashPrizeContainerClass,
  cashPrizeMainClass,
} from "@/components/cash-prize-campaign-frame";
import { CashPrizeHeader, IoeAwardCard } from "@/components/cash-prize-page-frame";
import { requireOnboardedUser } from "@/lib/auth";
import { getWeeklyCampaignState } from "@/lib/data/cash-prize-weekly";

export default async function CashPrizePage() {
  const { user } = await requireOnboardedUser();
  const state = await getWeeklyCampaignState(user.id);

  return (
    <main className={cashPrizeMainClass}>
      <div className={cashPrizeContainerClass}>
        <CashPrizeHeader />
        <section className="mt-6 space-y-6" aria-label="Cash prize campaigns">
          <CashPrizeCampaign state={state} />
          <IoeAwardCard />
        </section>
      </div>
    </main>
  );
}
