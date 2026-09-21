import type { ReactNode } from "react";

/**
 * The weekly campaign's fixed parts: the hero, the prize strip, the artwork.
 *
 * Shared by the Cash Prize page (`cash-prize-campaign.tsx`) and its route
 * skeleton (`app/app/cash-prize/loading.tsx`), so the skeleton draws the real
 * campaign rather than a copy that drifts from it. No hooks and no "use client":
 * it renders on the server for the skeleton and in the client bundle for the page.
 *
 * The hero and the strip are brand surfaces — lime, and deep green — and keep
 * their colours in both themes; the text on them is set for those colours, not
 * for the page's. Everything a student reads their own progress on follows the
 * theme (see the dashboard in `cash-prize-campaign.tsx`).
 */

export const cashPrizeMainClass = "min-h-full bg-bg-primary text-text-primary";
export const cashPrizeContainerClass = "mx-auto w-full max-w-[1180px] px-4 pb-24 pt-6 sm:px-6 md:px-8 lg:pt-11";

export const campaignCardClass =
  "overflow-hidden rounded-[20px] border border-[#c7dbac] bg-card shadow-[0_24px_65px_#2440121c,0_3px_9px_#24401212] sm:rounded-[26px] dark:border-border";

/** Lime and blue spin wheel, rupee notes and coins. Ids are prefixed: the page
 *  may hold other SVGs, and `<use href="#person">` resolves document-wide. */
export function CampaignArt() {
  return (
    <svg
      viewBox="0 0 470 350"
      role="img"
      aria-label="Lime and blue spin wheel with rupee notes and coins"
      className="h-[265px] w-full max-w-[340px] overflow-visible sm:h-[290px] sm:max-w-[460px] lg:h-[335px]"
    >
      <defs>
        <linearGradient id="cp-blue" x2="1" y2="1">
          <stop stopColor="#6fa4ff" />
          <stop offset=".35" stopColor="#0a67ff" />
          <stop offset="1" stopColor="#004acc" />
        </linearGradient>
        <linearGradient id="cp-metal" x2="1" y2="1">
          <stop stopColor="#fff" />
          <stop offset=".3" stopColor="#c4cdbb" />
          <stop offset=".55" stopColor="#fff" />
          <stop offset="1" stopColor="#aeb9a2" />
        </linearGradient>
        <linearGradient id="cp-coin" x2="0" y2="1">
          <stop stopColor="#f7df90" />
          <stop offset="1" stopColor="#cfad4e" />
        </linearGradient>
        <filter id="cp-shadow" x="-40%" y="-40%" width="180%" height="200%">
          <feDropShadow dx="0" dy="12" stdDeviation="9" floodColor="#395321" floodOpacity=".17" />
        </filter>
        <g id="cp-person">
          <circle cy="-5" r="5" />
          <path d="M-9 10a9 9 0 0 1 18 0z" />
        </g>
      </defs>
      <ellipse cx="255" cy="327" rx="151" ry="11" fill="#b4cc84" opacity=".28" />
      <g transform="translate(54 108) rotate(-21)" filter="url(#cp-shadow)">
        <rect width="94" height="49" rx="5" fill="#f9fff1" stroke="#98b7e5" />
        <rect x="6" y="6" width="82" height="37" rx="3" fill="#dfebfc" stroke="#adc8ed" />
        <ellipse cx="47" cy="25" rx="16" ry="18" fill="#bad5ff" />
        <text x="47" y="32" textAnchor="middle" fontSize="21" fill="#2f66b6" fontFamily="Arial">
          रु
        </text>
        <path d="M12 14h10m50 23h10" stroke="#628fcf" strokeWidth="3" />
      </g>
      <path
        d="m227 255-39 63q-5 9 8 9h117q12 0 7-9l-39-63"
        fill="url(#cp-blue)"
        stroke="#1457ae"
        strokeWidth="1"
      />
      <g filter="url(#cp-shadow)">
        <circle cx="261" cy="167" r="119" fill="#1758c5" />
        <circle cx="252" cy="163" r="119" fill="url(#cp-metal)" stroke="#a4af99" />
        <circle cx="252" cy="163" r="111" fill="#fffdf4" />
        <g stroke="#a4b18e" strokeWidth=".7">
          <path d="M252 163V52A111 111 0 0 1 330.5 84.5Z" fill="#c8ff35" />
          <path d="M252 163 330.5 84.5A111 111 0 0 1 363 163Z" fill="#0a67ff" />
          <path d="M252 163H363A111 111 0 0 1 330.5 241.5Z" fill="#fffdf4" />
          <path d="M252 163 330.5 241.5A111 111 0 0 1 252 274Z" fill="#c8ff35" />
          <path d="M252 163V274A111 111 0 0 1 173.5 241.5Z" fill="#0a67ff" />
          <path d="M252 163 173.5 241.5A111 111 0 0 1 141 163Z" fill="#fffdf4" />
          <path d="M252 163H141A111 111 0 0 1 173.5 84.5Z" fill="#c8ff35" />
          <path d="M252 163 173.5 84.5A111 111 0 0 1 252 52Z" fill="#0a67ff" />
        </g>
        <use href="#cp-person" transform="translate(279 92) rotate(22)" fill="#346807" />
        <use href="#cp-person" transform="translate(321 135) rotate(67)" fill="#fff" />
        <use href="#cp-person" transform="translate(321 191) rotate(112)" fill="#0a67ff" />
        <use href="#cp-person" transform="translate(280 232) rotate(157)" fill="#346807" />
        <use href="#cp-person" transform="translate(222 232) rotate(202)" fill="#fff" />
        <use href="#cp-person" transform="translate(181 191) rotate(247)" fill="#0a67ff" />
        <use href="#cp-person" transform="translate(181 135) rotate(292)" fill="#346807" />
        <use href="#cp-person" transform="translate(224 92) rotate(337)" fill="#fff" />
        <circle cx="252" cy="163" r="28" fill="url(#cp-metal)" stroke="#9da995" />
        <circle cx="252" cy="163" r="19" fill="#14210c" />
        <path
          d="m244 164 5 5 11-12"
          fill="none"
          stroke="#c8ff35"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M239 30q-5 0-3 6l13 29q3 5 6 0l13-29q2-6-3-6Z" fill="#c8ff35" stroke="#6d9c21" />
        <circle cx="252" cy="39" r="4" fill="#fff" />
      </g>
      <g transform="translate(347 227) rotate(15)" filter="url(#cp-shadow)">
        <rect width="99" height="53" rx="5" fill="#f9fff1" stroke="#8eb1e1" />
        <rect x="6" y="6" width="87" height="41" rx="3" fill="#e2edfc" stroke="#aec9ed" />
        <ellipse cx="50" cy="27" rx="17" ry="19" fill="#bdd6ff" />
        <text x="50" y="35" textAnchor="middle" fontSize="23" fill="#2f66b6" fontFamily="Arial">
          रु
        </text>
        <path d="M12 15h11m52 24h11" stroke="#628fcf" strokeWidth="3" />
      </g>
      <g stroke="#bf9c45" strokeWidth="1">
        <path d="M79 288v28c0 11 64 11 64 0v-28" fill="url(#cp-coin)" />
        <path d="M79 298c0 11 64 11 64 0m-64 9c0 11 64 11 64 0" fill="none" />
        <ellipse cx="111" cy="288" rx="32" ry="9" fill="#ffe8a1" />
        <ellipse cx="111" cy="288" rx="24" ry="5" fill="none" />
        <path d="M123 272v38c0 11 53 11 53 0v-38" fill="url(#cp-coin)" />
        <path
          d="M123 281c0 11 53 11 53 0m-53 10c0 11 53 11 53 0m-53 10c0 11 53 11 53 0"
          fill="none"
        />
        <ellipse cx="149.5" cy="272" rx="26.5" ry="8" fill="#ffe8a1" />
        <circle cx="164" cy="311" r="20" fill="url(#cp-coin)" />
        <circle cx="164" cy="311" r="16" fill="#ffe6a0" />
      </g>
      <text x="164" y="319" textAnchor="middle" fontSize="22" fill="#a37f25" fontFamily="Arial">
        रु
      </text>
      <path
        d="M106 57v15m-7-8h14M399 159v11m-5-5h10"
        fill="none"
        stroke="#84ac39"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CampaignHero() {
  return (
    <section className="relative flex flex-col bg-[radial-gradient(circle_at_77%_48%,#f3ffc4_0,#dcff8a_32%,transparent_62%),linear-gradient(115deg,#dbff74,#a9ed55)] px-6 pt-[26px] sm:grid sm:min-h-[430px] sm:grid-cols-[1.1fr_.9fr] sm:p-[30px] lg:grid-cols-[1.16fr_.84fr] lg:px-10 lg:pb-[30px] lg:pt-9">
      {/* The rings behind the wheel. Decoration only. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[-80px] top-[130px] size-[260px] rounded-full border border-white/45 shadow-[0_0_0_55px_#ffffff22,0_0_0_115px_#ffffff16] sm:right-[8%] sm:top-[35px] sm:size-[360px]"
      />
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-[9px] font-bold tracking-[1px] sm:gap-2.5 sm:text-[11px] sm:tracking-[1.5px]">
          <span className="rounded-[6px] bg-[#163918] px-[11px] py-2 text-[9px] tracking-[.7px] text-[#dcff9c] sm:text-[10px]">
            BCT STUDENTS ONLY
          </span>
          <span className="font-extrabold text-[#285627]">WEEKLY CHALLENGE</span>
        </div>
        <h2 className="mb-[9px] mt-[23px] text-[39px] font-bold leading-[1.03] tracking-[-2px] text-[#153814] sm:mt-[25px] sm:text-[38px] lg:text-[46px] lg:tracking-[-2.5px]">
          Build your streak.
          <br />
          Get a shot at
        </h2>
        <p className="text-[66px] font-extrabold leading-[1.06] tracking-[-4px] text-[#084fdd] [text-shadow:0_5px_0_#ffffff80] lg:text-[80px] lg:tracking-[-5px]">
          <small className="mr-2 text-[30px] tracking-[-1.6px] lg:text-[35px]">Rs.</small>5,000
        </p>
        <p className="mt-[9px] text-[13px] font-semibold text-[#111510] sm:text-[16px]">
          + 3 months of unlimited challenges
        </p>
        <p className="mt-4 max-w-[290px] text-[12px] leading-[1.55] text-[#345a28] sm:mt-[19px] sm:max-w-[370px] sm:text-[14px]">
          A little learning, every day.
          <br />
          Keep a <strong className="font-semibold text-[#1d2715]">7+ day streak</strong> to qualify
          for the draw.
        </p>
      </div>
      <div className="relative mt-2 flex h-[265px] items-center justify-center sm:mt-0 sm:h-auto">
        <span className="absolute right-0 top-3.5 z-10 inline-flex items-center rounded-full border border-[#cbe59b] bg-white px-3 py-2 text-[10px] font-bold text-[#174f1b] shadow-[0_7px_19px_#38642c1c] sm:top-0 sm:text-[11px]">
          <i aria-hidden="true" className="mr-1.5 inline-block size-1.5 rounded-full bg-[#599412]" />
          Friday draw
        </span>
        <CampaignArt />
      </div>
    </section>
  );
}

function Reward({ rank, title, detail }: { rank: string; title: string; detail: string }) {
  return (
    <div className="flex flex-1 items-center gap-2 text-[11px] sm:gap-[11px] sm:text-[13px] [&+&]:border-l [&+&]:border-[#456e40] [&+&]:pl-3 sm:[&+&]:pl-6">
      <span className="grid size-6 flex-none place-items-center rounded-full border border-[#88b274] text-[11px] text-[#d9ff9a] sm:size-[29px]">
        {rank}
      </span>
      <div>
        <b className="font-semibold">{title}</b>
        <small className="mt-[3px] block text-[10px] text-[#b5dca9] sm:text-[11px]">{detail}</small>
      </div>
    </div>
  );
}

/** The second and third prizes, and the way into the rules. The rules control is
 *  a slot: the page's opens the rules dialog, the skeleton's is inert. */
export function CampaignRewards({ rulesControl }: { rulesControl: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[#173719] bg-[#173719] px-6 py-[17px] text-white sm:flex-nowrap sm:gap-6 sm:px-[30px] sm:py-[19px] lg:px-10">
      <Reward rank="02" title="3 months unlimited" detail="Second winner · challenges" />
      <Reward rank="03" title="1 month unlimited" detail="Third winner · challenges" />
      {rulesControl}
    </div>
  );
}

export const rulesLinkClass =
  "w-full whitespace-nowrap pt-[5px] text-left text-[11px] text-[#d9ff9a] underline underline-offset-4 sm:w-auto sm:py-2 sm:text-[12px]";

/* The progress dashboard. It follows the theme: the design's greens are its
   light face. */

export const lineClass = "border-[#e1e6da] dark:border-border";
export const labelClass =
  "flex items-center gap-[7px] text-[11px] text-[#5c6557] sm:text-[12px] dark:text-text-secondary";
export const valueClass =
  "mb-3 mt-[9px] text-[30px] font-bold leading-none tracking-[-1.4px] text-[#15391a] sm:text-[35px] dark:text-text-primary";
export const unitClass =
  "ml-[3px] text-[11px] font-normal tracking-[-.1px] text-[#738066] sm:ml-1.5 sm:text-[13px] dark:text-text-muted";
export const hintClass =
  "mt-[9px] text-[10px] leading-[1.5] text-[#6d7863] sm:text-[11px] dark:text-text-muted";
export const buttonBaseClass =
  "inline-flex min-h-11 items-center justify-center gap-3.5 rounded-[10px] px-[17px] py-[13px] text-[12px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[#0a67ff]";
export const secondaryButtonClass = `${buttonBaseClass} border border-[#d9dfd0] bg-white text-[#111510] hover:bg-[#f3ffe3] dark:border-border dark:bg-card dark:text-text-primary dark:hover:bg-bg-tertiary`;
export const participateButtonClass = `${buttonBaseClass} border border-[#143819] bg-[#143819] text-white shadow-[0_7px_17px_#14381929] hover:bg-[#295d28] dark:border-[#c8ff35] dark:bg-[#c8ff35] dark:text-[#10250f] dark:hover:bg-[#b4ec2a]`;

export function Arrow() {
  return (
    <span aria-hidden="true" className="text-[17px] leading-none">
      ↗
    </span>
  );
}

export function StreakIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="size-4">
      <path d="M13 3c1 6-4 5-2 10 2 0 3-2 3-4 5 5 4 12-3 12S2 13 8 8c0 3 2 3 2 3-1-4 3-5 3-8Z" />
    </svg>
  );
}

export function ReferralsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="size-4">
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4 5" />
    </svg>
  );
}

export function WheelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="size-4">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 3v7m9 2h-7m-2 9v-7m-9-2h7" />
    </svg>
  );
}

export const progressSectionClass =
  "bg-white px-6 py-6 sm:px-[30px] lg:px-10 lg:pb-[26px] lg:pt-[27px] dark:bg-card";
export const progressHeadClass = "mb-6 flex items-center justify-between gap-[9px] lg:mb-[23px]";
export const progressTitleClass =
  "text-[14px] font-bold tracking-[-.2px] text-[#111510] sm:text-[15px] dark:text-text-primary";
export const statusPillClass =
  "whitespace-nowrap rounded-full border border-[#dce3d1] bg-[#f5f7ef] px-2.5 py-1.5 text-[10px] text-[#647052] sm:text-[11px] dark:border-border dark:bg-bg-tertiary dark:text-text-secondary";
export const statusPillMetClass =
  "whitespace-nowrap rounded-full border border-[#d6eeaf] bg-[#edffc8] px-2.5 py-1.5 text-[10px] text-[#365b0a] sm:text-[11px]";
export const metricsGridClass =
  "grid grid-cols-2 gap-x-[18px] gap-y-6 sm:grid-cols-[1fr_1fr_.78fr] sm:gap-5 lg:gap-8";
export const metricSecondClass = `border-l pl-[18px] sm:pl-5 lg:pl-8 ${lineClass}`;
/** On a phone the third metric takes its own row, figure on the right. */
export const metricThirdClass = `col-span-2 grid grid-cols-[1fr_auto] border-t pt-[17px] sm:col-span-1 sm:block sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 lg:pl-8 ${lineClass}`;
export const metricThirdValueClass = `${valueClass} max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1 max-sm:m-0`;
export const streakDaysClass = "grid max-w-[275px] grid-cols-7 gap-[3px] sm:gap-1.5";
export const streakDayClass =
  "grid h-[23px] place-items-center rounded-[5px] border border-[#e0e5d7] bg-[#f4f6ef] text-[9px] text-[#839075] sm:h-[27px] sm:rounded-[7px] sm:text-[10px] dark:border-border dark:bg-bg-tertiary dark:text-text-muted";
export const streakDayDoneClass =
  "grid h-[23px] place-items-center rounded-[5px] border border-[#98d026] bg-[#bfff36] text-[9px] text-[#274300] sm:h-[27px] sm:rounded-[7px] sm:text-[10px]";
export const referralTrackClass =
  "mb-5 mt-[22px] h-1.5 overflow-hidden rounded-[20px] bg-[#e9ede3] dark:bg-bg-tertiary";
export const entryPillsClass = "mt-[9px] flex flex-wrap items-center gap-[5px] sm:mt-3.5 lg:flex-nowrap";
export const entryPillClass =
  "whitespace-nowrap rounded-[4px] border border-[#dce3d3] bg-[#f6f8f1] px-2 py-[5px] text-[10px] text-[#111510] dark:border-border dark:bg-bg-tertiary dark:text-text-secondary";
export const entryPillBonusClass =
  "whitespace-nowrap rounded-[4px] border border-[#d9efb9] bg-[#edffc7] px-2 py-[5px] text-[10px] text-[#111510]";
export const actionsClass = `mt-[22px] flex flex-col items-start gap-[18px] border-t pt-[23px] lg:mt-[25px] lg:flex-row lg:items-center lg:justify-between lg:gap-5 ${lineClass}`;
export const actionButtonsClass =
  "flex w-full flex-col gap-2.5 sm:flex-row lg:w-auto lg:shrink-0 sm:[&>*]:flex-1 lg:[&>*]:flex-none";

export function ActionsCopy() {
  return (
    <div>
      <p className="mb-[5px] text-[13px] font-semibold text-[#111510] dark:text-text-primary">
        Bring your study circle along.
      </p>
      <p className="text-[11px] text-[#6f7868] dark:text-text-muted">
        Every 5 referrals adds your name to the wheel once more.
      </p>
    </div>
  );
}
