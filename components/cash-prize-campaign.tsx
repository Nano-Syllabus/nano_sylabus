"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  buttonBaseClass,
  campaignCardClass,
  entryPillBonusClass,
  entryPillClass,
  entryPillsClass,
  hintClass,
  labelClass,
  lineClass,
  metricSecondClass,
  metricThirdClass,
  metricThirdValueClass,
  metricsGridClass,
  participateButtonClass,
  progressHeadClass,
  progressSectionClass,
  progressTitleClass,
  referralTrackClass,
  rulesLinkClass,
  secondaryButtonClass,
  statusPillClass,
  statusPillMetClass,
  streakDayClass,
  streakDayDoneClass,
  streakDaysClass,
  unitClass,
  valueClass,
} from "@/components/cash-prize-campaign-frame";
import type { WeeklyCampaignState } from "@/lib/data/cash-prize-weekly";

/**
 * The weekly streak campaign: hero, prizes, the student's progress, the rules
 * and their referral link.
 *
 * Every figure comes from the server (`getWeeklyCampaignState`), and Confirm
 * participation asks the server to check the rules again before it registers
 * anything. This component only displays eligibility; it never decides it.
 *
 * The constants below mirror `CAMPAIGN` in `lib/data/cash-prize-weekly.ts`. That
 * module reads the database and cannot ship to the browser, so they are copied,
 * and `cash-prize-weekly.test.ts` holds the two copies together.
 */
const STREAK_DAYS_REQUIRED = 7;
const REFERRALS_PER_ENTRY = 5;

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

function formatDrawDate(drawDate: string) {
  // A calendar date, not an instant: formatted in UTC so server and browser agree.
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${drawDate}T00:00:00.000Z`));
}

/* The dialogs. Only this component opens them, so their classes live here. */
const modalActionClass = `${buttonBaseClass} w-full border border-[#105fef] bg-[#105fef] text-white shadow-[0_7px_17px_#105fef32] hover:bg-[#074ecf] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:bg-[#105fef]`;
const dialogClass =
  "m-auto max-h-[85dvh] w-[min(480px,calc(100%-32px))] overflow-auto rounded-[22px] border border-[#d4e3be] bg-card p-0 text-text-primary shadow-[0_30px_100px_#101a164d] backdrop:bg-[#13200c66] backdrop:backdrop-blur-[5px] dark:border-border";
const closeButtonClass =
  "grid size-8 flex-none place-items-center rounded-full bg-[#f1f4e9] text-[22px] leading-none text-[#111510] focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[#0a67ff] dark:bg-bg-tertiary dark:text-text-primary";
const noteClass = "text-[11px] leading-[1.5] text-[#7b8472] dark:text-text-muted";

/**
 * A native modal `<dialog>`: the browser supplies the focus trap, Escape and the
 * top layer. `open` drives it; the dialog's own close (Escape) reports back.
 */
function CampaignDialog({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className={dialogClass}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself, outside its box.
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom;
        if (outside) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

/**
 * A modal dialog renders in the top layer, above anything in the page however
 * high its z-index, so a toast raised from inside one must be drawn inside it.
 * One per surface; only the one in front is given the message. Always mounted:
 * a live region announces changes to it, not its own arrival.
 */
function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[22px] left-1/2 z-[110] -translate-x-1/2 rounded-[9px] bg-[#141b0f] px-[18px] py-3 text-[12px] text-white empty:hidden"
    >
      {message}
    </div>
  );
}

type Participation = WeeklyCampaignState["participation"];

export function CashPrizeCampaign({ state }: { state: WeeklyCampaignState }) {
  const { streakDays, verifiedReferrals, entries, eligibleCommunity, drawDate } = state;
  const [participation, setParticipation] = useState<Participation>(state.participation);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [referralError, setReferralError] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);
  const referralInputRef = useRef<HTMLInputElement>(null);
  const rulesTitleId = useId();
  const referralTitleId = useId();
  const referralInputId = useId();

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3000);
  }

  const eligibleFaculty = Boolean(eligibleCommunity);
  const qualified = entries.qualified;
  const daysToGo = Math.max(0, STREAK_DAYS_REQUIRED - streakDays);
  const towardNext = verifiedReferrals % REFERRALS_PER_ENTRY;
  const referralsToGo = REFERRALS_PER_ENTRY - towardNext;
  const drawLabel = formatDrawDate(drawDate);
  // A referral that verified after confirming raises the entry; confirming again records it.
  const canConfirm = qualified && (!participation || participation.entries < entries.active);

  const status = !eligibleFaculty
    ? "BCT students only"
    : participation
      ? "You're in Friday's draw"
      : qualified
        ? "Streak requirement met"
        : `${daysToGo} more ${plural(daysToGo, "day", "days")} to qualify`;

  const streakHint =
    streakDays >= STREAK_DAYS_REQUIRED
      ? "Keep your streak going."
      : streakDays === 0
        ? "Start your first challenge today."
        : "Keep going. You're almost there.";

  const entryHint = !eligibleFaculty
    ? "This week's draw is for BCT students."
    : qualified
      ? `1 streak entry + ${entries.bonus} referral ${plural(entries.bonus, "entry", "entries")}.`
      : `${entries.potential} ${plural(entries.potential, "entry unlocks", "entries unlock")} at a 7-day streak.`;

  async function confirmParticipation() {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/student/cash-prize/participate", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        participation?: { entries: number; confirmedAt: string };
        error?: string;
      };
      if (!response.ok || !payload.participation) {
        showToast(payload.error || "Could not confirm. Please try again.");
        return;
      }
      setParticipation({
        entries: payload.participation.entries,
        confirmedAt: payload.participation.confirmedAt,
      });
      showToast("Participation confirmed");
    } catch {
      showToast("Could not confirm. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openReferral() {
    setReferralOpen(true);
    if (referralLink) return;
    if (state.referralCode) {
      setReferralLink(`${window.location.origin}/r/${encodeURIComponent(state.referralCode)}`);
      return;
    }
    // No link yet: create one. Every student may; the server holds the rules.
    setReferralError("");
    try {
      const response = await fetch("/api/billing/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: "{}",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        referral?: { link: string };
        error?: string;
      };
      if (!response.ok || !payload.referral?.link) {
        setReferralError(payload.error || "Your referral link could not be created. Please try again.");
        return;
      }
      setReferralLink(payload.referral.link);
    } catch {
      setReferralError("Could not reach NanoSyllabus. Check your connection and try again.");
    }
  }

  async function copyReferralLink(input: HTMLInputElement | null) {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      showToast("Link copied");
    } catch {
      input?.focus();
      input?.select();
      showToast("Select and copy the link above");
    }
  }

  return (
    <>
      <article className={campaignCardClass}>
        <CampaignHero />
        <CampaignRewards
          rulesControl={
            <button type="button" className={rulesLinkClass} onClick={() => setRulesOpen(true)}>
              How it works ↗
            </button>
          }
        />

        <section aria-label="Your campaign progress" className={progressSectionClass}>
          <div className={progressHeadClass}>
            <h3 className={progressTitleClass}>Your progress</h3>
            <span aria-live="polite" className={qualified || participation ? statusPillMetClass : statusPillClass}>
              {status}
            </span>
          </div>

          <div className={metricsGridClass}>
            <div>
              <p className={labelClass}>
                <StreakIcon />
                Challenge streak
              </p>
              <p className={valueClass}>
                {streakDays}
                <small className={unitClass}>
                  {streakDays >= STREAK_DAYS_REQUIRED ? "days" : "/ 7 days"}
                </small>
              </p>
              <div
                role="img"
                aria-label={`${Math.min(STREAK_DAYS_REQUIRED, streakDays)} of 7 streak days completed`}
                className={streakDaysClass}
              >
                {Array.from({ length: STREAK_DAYS_REQUIRED }, (_, index) => (
                  <span
                    key={index}
                    aria-hidden="true"
                    className={index < streakDays ? streakDayDoneClass : streakDayClass}
                  >
                    {index < streakDays ? "✓" : index + 1}
                  </span>
                ))}
              </div>
              <p className={hintClass}>{streakHint}</p>
            </div>

            <div className={metricSecondClass}>
              <p className={labelClass}>
                <ReferralsIcon />
                Your referrals
              </p>
              <p className={valueClass}>
                {verifiedReferrals}
                <small className={unitClass}>verified</small>
              </p>
              <div
                role="progressbar"
                aria-label="Referrals toward next bonus entry"
                aria-valuemin={0}
                aria-valuemax={REFERRALS_PER_ENTRY}
                aria-valuenow={towardNext}
                className={referralTrackClass}
              >
                <span
                  className="block h-full rounded-[20px] bg-[linear-gradient(90deg,#2174ff,#0a51d8)]"
                  style={{ width: `${(towardNext / REFERRALS_PER_ENTRY) * 100}%` }}
                />
              </div>
              <p className={hintClass}>
                {referralsToGo} more {plural(referralsToGo, "referral", "referrals")} = +1 extra entry
              </p>
            </div>

            <div className={metricThirdClass}>
              <p className={labelClass}>
                <WheelIcon />
                Wheel entries
              </p>
              <p className={metricThirdValueClass}>
                {entries.active}
                <small className={unitClass}>active</small>
              </p>
              <div className={entryPillsClass}>
                <span className={entryPillClass}>1 base</span>
                <span className={entryPillBonusClass}>
                  +{entries.bonus} referral {plural(entries.bonus, "entry", "entries")}
                </span>
              </div>
              <p className={`${hintClass} col-span-2`}>{entryHint}</p>
            </div>
          </div>

          <div className={actionsClass}>
            <ActionsCopy />
            <div className={actionButtonsClass}>
              <Link href="/app/challenges" className={secondaryButtonClass}>
                Keep my streak <Arrow />
              </Link>
              <button type="button" className={secondaryButtonClass} onClick={() => void openReferral()}>
                Referral link <Arrow />
              </button>
              <button type="button" className={participateButtonClass} onClick={() => setRulesOpen(true)}>
                {participation && !canConfirm ? "You're in ✓" : "Participate"} <Arrow />
              </button>
            </div>
          </div>
        </section>
      </article>

      <CampaignDialog open={rulesOpen} onClose={() => setRulesOpen(false)} labelledBy={rulesTitleId}>
        <div className="p-[23px] sm:p-[30px]">
          <span className="mb-3 inline-block rounded-[5px] bg-[#e9f2ff] px-[9px] py-1.5 text-[10px] font-extrabold tracking-[.1em] text-[#0d61df]">
            BCT WEEKLY CHALLENGE
          </span>
          <div className="flex items-center justify-between gap-5">
            <h2 id={rulesTitleId} className="text-[26px] font-bold tracking-[-1px]">
              Your shot at the wheel.
            </h2>
            <button type="button" aria-label="Close rules" className={closeButtonClass} onClick={() => setRulesOpen(false)}>
              ×
            </button>
          </div>
          <p className="mt-3 text-[14px] leading-[1.6] text-[#68705f] dark:text-text-secondary">
            Read the rules before participating in this week&apos;s draw.
          </p>
          <ol className="my-5 text-[14px] leading-[1.65] text-[#4d5941] dark:text-text-secondary">
            {[
              [
                "Complete a 7-day challenge streak.",
                "Finish challenges on seven consecutive days. Only BCT students qualify this week.",
              ],
              ["Submit your own work.", "AI-generated submissions are not allowed."],
              [
                "Bring friends for extra chances.",
                "Every 5 verified referrals repeats your name once more on the wheel. A referral is verified once the student you invited passes their first challenge. Referrals do not replace the streak requirement.",
              ],
              [
                "Friday draw.",
                "First wins Rs. 5,000 + 3 months unlimited challenges; second wins 3 months; third wins 1 month.",
              ],
            ].map(([rule, detail], index) => (
              <li key={rule} className={`flex items-start gap-3 border-t py-3 ${lineClass}`}>
                <span aria-hidden="true" className="pt-[3px] text-[12px] font-extrabold text-[#0b60e8]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex-1">
                  <b className="text-text-primary">{rule}</b> {detail}
                </span>
              </li>
            ))}
          </ol>

          <div
            role="status"
            aria-live="polite"
            className={
              qualified
                ? "my-[18px] rounded-[13px] border border-[#b5e474] bg-[#efffd5] p-[15px] text-[12px] leading-[1.5] text-[#244f15]"
                : "my-[18px] rounded-[13px] border border-[#dae8ca] bg-[#f2f6e9] p-[15px] text-[12px] leading-[1.5] text-[#4e6244] dark:border-border dark:bg-bg-tertiary dark:text-text-secondary"
            }
          >
            {!eligibleFaculty ? (
              <>
                <strong className="mb-[3px] block text-[14px] text-[#1c3b16] dark:text-text-primary">
                  BCT students only
                </strong>
                This week&apos;s draw is open to BCT students. Join your BCT community to take part.
              </>
            ) : qualified ? (
              <>
                <strong className="mb-[3px] block text-[14px] text-[#1c3b16]">Streak complete ✓</strong>
                Your {streakDays}-day streak qualifies you for the draw on {drawLabel}.
              </>
            ) : (
              <>
                <strong className="mb-[3px] block text-[14px] text-[#1c3b16] dark:text-text-primary">
                  {daysToGo} more {plural(daysToGo, "day", "days")} to go
                </strong>
                Complete your 7-day streak to unlock confirmation.
              </>
            )}
          </div>

          {canConfirm || !participation ? (
            <button
              type="button"
              className={modalActionClass}
              disabled={!canConfirm || submitting}
              aria-busy={submitting}
              onClick={() => void confirmParticipation()}
            >
              {submitting
                ? "Confirming…"
                : participation
                  ? `Update my entry to ${entries.active}`
                  : "Confirm participation"}
            </button>
          ) : null}

          {participation ? (
            <p className="mt-[15px] rounded-[12px] bg-[#eaffce] p-[15px] text-[13px] leading-[1.5] text-[#285413]">
              You&apos;re in the draw on {drawLabel} with {participation.entries}{" "}
              {plural(participation.entries, "entry", "entries")}.
            </p>
          ) : (
            <p className={`mt-3 ${noteClass}`}>
              Your streak, community and referrals are checked again on our server when you confirm.
            </p>
          )}
        </div>
        <Toast message={rulesOpen ? toast : ""} />
      </CampaignDialog>

      <CampaignDialog open={referralOpen} onClose={() => setReferralOpen(false)} labelledBy={referralTitleId}>
        <div className="p-[23px] sm:p-7">
          <div className="flex items-center justify-between gap-5">
            <h2 id={referralTitleId} className="text-[23px] font-bold tracking-[-1px]">
              Your referral link
            </h2>
            <button
              type="button"
              aria-label="Close referral link"
              className={closeButtonClass}
              onClick={() => setReferralOpen(false)}
            >
              ×
            </button>
          </div>
          <p className="my-3 text-[14px] leading-[1.6] text-[#68705f] dark:text-text-secondary">
            Invite your study circle. Every 5 verified referrals unlocks one extra wheel entry once
            your streak qualifies.
          </p>
          {referralError ? (
            <p role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[12px] text-destructive">
              {referralError}
            </p>
          ) : null}
          <label className={noteClass} htmlFor={referralInputId}>
            Referral link
          </label>
          <input
            ref={referralInputRef}
            id={referralInputId}
            readOnly
            value={referralLink ?? (referralError ? "" : "Creating your link…")}
            className="mb-3.5 mt-[5px] w-full rounded-lg border border-[#d5dec9] bg-[#f6f9ef] p-[13px] text-[12px] text-[#3d5525] dark:border-border dark:bg-bg-tertiary dark:text-text-primary"
          />
          <button
            type="button"
            className={modalActionClass}
            disabled={!referralLink}
            onClick={() => void copyReferralLink(referralInputRef.current)}
          >
            Copy link <Arrow />
          </button>
          <p className={`mt-3 ${noteClass}`}>
            A referral counts once the student you invited passes their first challenge.
          </p>
        </div>
        <Toast message={referralOpen ? toast : ""} />
      </CampaignDialog>

      <Toast message={rulesOpen || referralOpen ? "" : toast} />
    </>
  );
}
