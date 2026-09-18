import Image from "next/image";
import { CashPrizeParticipation } from "@/components/cash-prize-participation";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { getDailyCashPrizeProgress } from "@/lib/data/cash-prize";

const assetRoot = "/figma/cash-prize";

function IconText({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
      <Image
        src={`${assetRoot}/${icon}`}
        alt=""
        width={16}
        height={16}
        aria-hidden="true"
        className="dark:brightness-0 dark:invert"
      />
      <span>{children}</span>
    </div>
  );
}

function PrizeChip({ medal, children }: { medal: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-bg-primary/70 px-2 py-1 text-xs font-semibold text-text-primary">
      <Image src={`${assetRoot}/${medal}`} alt="" width={16} height={16} aria-hidden="true" />
      <span className="whitespace-nowrap">{children}</span>
    </div>
  );
}

export default async function CashPrizePage() {
  const { user } = await requireOnboardedUser();
  const dailyProgress = await getDailyCashPrizeProgress(user.id);

  return (
    <>
      <SetAppShell title="Cash Prize" />
      <main className="font-figma-library min-h-full bg-bg-primary px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pt-[55px]">
        <div className="mx-auto w-full max-w-[1100px] xl:origin-top xl:scale-90">
          <header className="flex min-h-[124px] flex-col items-start justify-between gap-5 sm:flex-row">
            <div>
              <h1 className="text-[32px] font-bold leading-none tracking-[-0.035em] text-text-primary sm:text-[40px] lg:text-[48px]">
                Earn while you learn
              </h1>
              <p className="mt-3 text-base font-medium text-text-secondary lg:text-lg">
                Complete challenges. Score higher. Win cash.
              </p>
            </div>
            <div className="inline-flex items-center gap-[9px] rounded-full border-[1.5px] border-border bg-card px-[18px] py-[9px] text-base font-medium text-text-secondary lg:mt-[10px] lg:text-[19.5px]">
              <span className="size-3 rounded-full bg-[#22c55e]" aria-hidden="true" />
              <span>1 active campaigns</span>
            </div>
          </header>

          <section className="space-y-6" aria-label="Cash prize campaigns">
            <article className="relative overflow-hidden rounded-[24px] border border-[#6dd944] bg-[#e0feb1] p-6 dark:border-[#d4ff36]/35 dark:bg-card lg:min-h-[330px] lg:p-8 xl:h-[330px]">
              <div className="relative z-10 grid items-center gap-6 lg:grid-cols-[300px_minmax(230px,1fr)] xl:h-[266px] xl:grid-cols-[300px_256px]">
                <div className="flex min-h-[242px] flex-col items-start gap-4">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-bg-primary px-2.5 py-1 text-xs font-bold text-text-secondary">
                    <span className="size-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
                    DAILY
                  </div>
                  <div>
                    <h2 className="text-[30px] font-bold leading-[1.45] text-text-primary">
                      Daily Challenge Lottery
                    </h2>
                    <p className="mt-2 max-w-[280px] text-base leading-[1.4] text-text-secondary">
                      Complete 1 challenges and enter tonight&apos;s draw.
                    </p>
                  </div>
                  <div className="mt-auto w-full max-w-[300px]">
                    <p className="text-[13px] font-medium text-text-secondary">
                      {dailyProgress.completedForEntry}/{dailyProgress.requiredForEntry} completed
                    </p>
                    <div
                      className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg-tertiary"
                      role="progressbar"
                      aria-label="Daily challenge completion"
                      aria-valuemin={0}
                      aria-valuemax={dailyProgress.requiredForEntry}
                      aria-valuenow={dailyProgress.completedForEntry}
                    >
                      <div
                        className="h-full rounded-full bg-[#22c55e] transition-[width] duration-300 motion-reduce:transition-none"
                        style={{ width: `${dailyProgress.progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-[15px]">
                  <div>
                    <p className="text-sm font-medium text-text-primary">DAILY PRIZE POOL</p>
                    <p className="text-[32px] font-bold leading-[1.5] text-[#0066ff]">Rs. 1,000</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PrizeChip medal="medal-1.svg">Rs. 500</PrizeChip>
                    <span className="h-4 w-px bg-border" aria-hidden="true" />
                    <PrizeChip medal="medal-2.svg">Rs. 300</PrizeChip>
                    <span className="h-4 w-px bg-border" aria-hidden="true" />
                    <PrizeChip medal="medal-3.svg">Rs. 200</PrizeChip>
                  </div>
                  <div className="space-y-2">
                    <IconText icon="clock.svg">Live spin wheel at 9 PM</IconText>
                    <IconText icon="users.svg">3 winners every day</IconText>
                  </div>
                  <CashPrizeParticipation eligible={dailyProgress.isEligible} />
                </div>
              </div>
              <div
                className="absolute right-8 top-[21px] hidden h-[288px] w-[431px] xl:block"
                aria-hidden="true"
              >
                <Image
                  src={`${assetRoot}/daily-shape.svg`}
                  alt=""
                  fill
                  className="object-contain"
                  sizes="431px"
                />
                <Image
                  src={`${assetRoot}/daily-lottery-transparent.png`}
                  alt="Daily prize wheel with first, second, and third-place prizes"
                  width={362}
                  height={254}
                  className="absolute bottom-0 left-[35px] h-[254px] w-[362px] object-contain"
                />
              </div>
            </article>

            <article className="relative overflow-hidden rounded-[24px] border border-[#cbcbcb] bg-[#e3e3e5] p-6 dark:border-border dark:bg-card lg:min-h-[330px] lg:p-8 xl:h-[330px]">
              <div className="relative z-10 grid items-center gap-6 lg:grid-cols-[300px_minmax(270px,1fr)] xl:h-[266px] xl:grid-cols-[300px_335px]">
                <div className="flex min-h-[242px] flex-col items-start gap-4">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-bg-primary px-2.5 py-1 text-xs font-bold text-text-secondary">
                    <span className="size-1.5 rounded-full bg-[#94a3b8]" aria-hidden="true" />
                    IOE EXAM
                  </div>
                  <div>
                    <h2 className="max-w-[316px] text-[30px] font-bold leading-[1.45] text-text-primary">
                      IOE Top Scorer Award
                    </h2>
                    <p className="mt-2 max-w-[280px] text-[15px] font-medium leading-[1.4] text-text-secondary">
                      Become the highest scorer and win the grand prize.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-4">
                  <div>
                    <p className="text-sm font-medium text-text-primary">TOTAL PRIZE POOL</p>
                    <p className="text-[32px] font-bold leading-[1.5] text-[#646b76]">Rs. 40,000</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs font-semibold text-text-primary">
                    {[
                      ["1st Year", "Rs.10,000"],
                      ["2nd Year", "Rs.10,000"],
                      ["3rd Year", "Rs.10,000"],
                      ["4thYear", "Rs.10,000"],
                    ].map(([year, amount]) => (
                      <div
                        key={year}
                        className="rounded-md bg-bg-primary/70 px-2 py-1 whitespace-nowrap"
                      >
                        {year} <span className="text-text-muted">{amount}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <IconText icon="book.svg">Prepare with Nano Syllabus</IconText>
                    <IconText icon="trending-up.svg">Score highest in the IOE exam</IconText>
                  </div>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#a8adb5] px-6 py-3 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#646b76] focus-visible:ring-offset-2"
                  >
                    Dropping Soon
                    <Image
                      src={`${assetRoot}/arrow-right-muted.svg`}
                      alt=""
                      width={16}
                      height={16}
                      aria-hidden="true"
                      className="dark:brightness-0 dark:invert"
                    />
                  </button>
                </div>
              </div>
              <Image
                src={`${assetRoot}/ioe-award.png`}
                alt="Student celebrating the IOE top scorer cash award"
                width={353}
                height={318}
                className="absolute right-8 top-1.5 hidden h-[318px] w-[353px] object-cover xl:block"
              />
            </article>
          </section>
        </div>
      </main>
    </>
  );
}
