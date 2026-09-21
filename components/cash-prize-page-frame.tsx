import Image from "next/image";
import type { ReactNode } from "react";

/**
 * What the Cash Prize page carries around the weekly campaign: its header, and
 * the IOE Top Scorer Award, which is announced but not open yet.
 *
 * Both came through the weekly rebuild unchanged from the page they were on —
 * only the daily lottery card was replaced. Neither depends on the student, so
 * the page and its route skeleton (`app/app/cash-prize/loading.tsx`) draw them
 * from here, for real.
 */

const assetRoot = "/figma/cash-prize";

/** Campaigns a student can take part in today. The IOE award is not one yet. */
const ACTIVE_CAMPAIGNS = 1;

export function CashPrizeHeader() {
  return (
    <header className="font-figma-library flex min-h-[124px] flex-col items-start justify-between gap-5 sm:flex-row">
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
        <span>
          {ACTIVE_CAMPAIGNS} active {ACTIVE_CAMPAIGNS === 1 ? "campaign" : "campaigns"}
        </span>
      </div>
    </header>
  );
}

function IconText({ icon, children }: { icon: string; children: ReactNode }) {
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

export function IoeAwardCard() {
  return (
    <article className="font-figma-library relative overflow-hidden rounded-[24px] border border-[#cbcbcb] bg-[#e3e3e5] p-6 dark:border-border dark:bg-card lg:min-h-[330px] lg:p-8 xl:h-[330px]">
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
            <p className="text-[32px] font-bold leading-[1.5] text-[#646b76] dark:text-text-secondary">
              Rs. 40,000
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs font-semibold text-text-primary">
            {[
              ["1st Year", "Rs.10,000"],
              ["2nd Year", "Rs.10,000"],
              ["3rd Year", "Rs.10,000"],
              ["4th Year", "Rs.10,000"],
            ].map(([year, amount]) => (
              <div key={year} className="whitespace-nowrap rounded-md bg-bg-primary/70 px-2 py-1">
                {year} <span className="text-text-muted">{amount}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <IconText icon="book.svg">Prepare with Nano Syllabus</IconText>
            <IconText icon="trending-up.svg">Score highest in the IOE exam</IconText>
          </div>
          {/* Not open yet: a label shaped like the button it will become. It was
              a <button> that did nothing when pressed. */}
          <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#a8adb5] px-6 py-3 text-sm font-bold text-white">
            Dropping Soon
            <Image
              src={`${assetRoot}/arrow-right-muted.svg`}
              alt=""
              width={16}
              height={16}
              aria-hidden="true"
              className="dark:brightness-0 dark:invert"
            />
          </span>
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
  );
}
