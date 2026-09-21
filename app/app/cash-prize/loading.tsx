import {
  ActionsCopy,
  Arrow,
  CampaignHero,
  CampaignRewards,
  ReferralsIcon,
  StreakIcon,
  WheelIcon,
  actionButtonsClass,
  actionsClass,
  campaignCardClass,
  cashPrizeContainerClass,
  cashPrizeMainClass,
  entryPillClass,
  entryPillsClass,
  labelClass,
  metricSecondClass,
  metricThirdClass,
  metricsGridClass,
  participateButtonClass,
  progressHeadClass,
  progressSectionClass,
  progressTitleClass,
  referralTrackClass,
  rulesLinkClass,
  secondaryButtonClass,
  streakDaysClass,
} from "@/components/cash-prize-campaign-frame";
import { CashPrizeHeader, IoeAwardCard } from "@/components/cash-prize-page-frame";

/**
 * Only the unknown blocks pulse; the fill is `bg-border`, never
 * `bg-bg-secondary`, which vanishes inside a dark-theme card.
 */
const pulse = "animate-pulse bg-border motion-reduce:animate-none";
const skeleton = `${pulse} rounded`;

/**
 * The Cash Prize page as it will look, drawn from the same frame the page uses.
 *
 * The hero, the prizes, every label and the buttons do not depend on the
 * student and are drawn for real. What does — the status, the three figures,
 * the streak's seven days, the referral bar, the hints — pulses, each block the
 * size of what replaces it, so nothing moves when the data lands. The buttons
 * are drawn inert: `aria-hidden` and not focusable, since they do nothing yet.
 */
export default function CashPrizeLoading() {
  return (
    <main className={cashPrizeMainClass} aria-busy="true" aria-label="Loading cash prize campaign">
      <div className={cashPrizeContainerClass}>
        <CashPrizeHeader />
        <section className="mt-6 space-y-6" aria-label="Cash prize campaigns">
          <article className={campaignCardClass}>
            <CampaignHero />
            <CampaignRewards
              rulesControl={<span className={rulesLinkClass}>How it works ↗</span>}
            />

            <section className={progressSectionClass}>
              <div className={progressHeadClass}>
                <h3 className={progressTitleClass}>Your progress</h3>
                <span className={`h-[27px] w-32 rounded-full ${pulse}`} />
              </div>

              <div className={metricsGridClass}>
                <div>
                  <p className={labelClass}>
                    <StreakIcon />
                    Challenge streak
                  </p>
                  <div className={`mb-3 mt-[9px] h-[30px] w-24 sm:h-[35px] ${skeleton}`} />
                  <div className={streakDaysClass}>
                    {Array.from({ length: 7 }, (_, index) => (
                      <span
                        key={index}
                        className={`h-[23px] rounded-[5px] sm:h-[27px] sm:rounded-[7px] ${pulse}`}
                      />
                    ))}
                  </div>
                  <div className={`mt-[9px] h-3 w-40 max-w-full ${skeleton}`} />
                </div>

                <div className={metricSecondClass}>
                  <p className={labelClass}>
                    <ReferralsIcon />
                    Your referrals
                  </p>
                  <div className={`mb-3 mt-[9px] h-[30px] w-24 sm:h-[35px] ${skeleton}`} />
                  <div className={referralTrackClass} />
                  <div className={`mt-[9px] h-3 w-44 max-w-full ${skeleton}`} />
                </div>

                <div className={metricThirdClass}>
                  <p className={labelClass}>
                    <WheelIcon />
                    Wheel entries
                  </p>
                  <div
                    className={`h-[30px] w-20 max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1 sm:mb-3 sm:mt-[9px] sm:h-[35px] ${skeleton}`}
                  />
                  <div className={entryPillsClass}>
                    {/* A constant, not data. */}
                    <span className={entryPillClass}>1 base</span>
                    <span className={`h-[23px] w-24 rounded-[4px] ${pulse}`} />
                  </div>
                  <div className={`col-span-2 mt-[9px] h-3 w-44 max-w-full ${skeleton}`} />
                </div>
              </div>

              <div className={actionsClass}>
                <ActionsCopy />
                <div className={actionButtonsClass} aria-hidden="true">
                  <span className={secondaryButtonClass}>
                    Keep my streak <Arrow />
                  </span>
                  <span className={secondaryButtonClass}>
                    Referral link <Arrow />
                  </span>
                  <span className={participateButtonClass}>
                    Participate <Arrow />
                  </span>
                </div>
              </div>
            </section>
          </article>
          <IoeAwardCard />
        </section>
      </div>
    </main>
  );
}
