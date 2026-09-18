"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const assetRoot = "/figma/cash-prize";

function QualificationStep({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-bg-tertiary">
        <Image
          src={`${assetRoot}/${icon}`}
          alt=""
          width={16}
          height={16}
          aria-hidden="true"
          className="dark:brightness-0 dark:invert"
        />
      </div>
      <p className="text-[12px] font-semibold text-text-primary">{children}</p>
    </div>
  );
}

function PrizePill({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-bg-primary px-2.5 py-1">
      <Image src={`${assetRoot}/${icon}`} alt="" width={12} height={12} aria-hidden="true" />
      <span className="whitespace-nowrap text-[10px] font-semibold text-text-primary">
        {children}
      </span>
    </div>
  );
}

export function CashPrizeParticipation({ eligible }: { eligible: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  const closeDialog = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  function continueToChallenge() {
    setOpen(false);
    router.push("/app/challenges");
  }

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primaryButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="View cash prize participation details"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0066ff] px-7 py-3 text-[15px] font-bold text-white transition-colors hover:bg-[#0059df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066ff] focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        Participate
        <Image
          src={`${assetRoot}/arrow-right.svg`}
          alt=""
          width={16}
          height={16}
          aria-hidden="true"
        />
      </button>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 dark:bg-bg-primary/95"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeDialog();
              }}
            >
              {eligible ? (
                <div
                  ref={dialogRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={titleId}
                  aria-describedby={descriptionId}
                  className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[446px] flex-col items-center gap-5 overflow-y-auto rounded-[20px] border border-border bg-card px-8 pb-10 pt-12 text-center text-text-primary shadow-2xl sm:px-[34px]"
                >
                  <button
                    type="button"
                    onClick={closeDialog}
                    aria-label="Close congratulations dialog"
                    className="absolute right-5 top-5 flex size-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#071a3c] focus-visible:ring-offset-2 sm:right-6 sm:top-4"
                  >
                    <Image
                      src={`${assetRoot}/completion-close.svg`}
                      alt=""
                      width={20}
                      height={20}
                      aria-hidden="true"
                      className="dark:brightness-0 dark:invert"
                    />
                  </button>

                  <div
                    className="relative h-[150px] w-[206px] shrink-0 overflow-hidden"
                    aria-hidden="true"
                  >
                    <Image
                      src={`${assetRoot}/completion-trophy.png`}
                      alt=""
                      width={341}
                      height={182}
                      className="absolute -left-[84px] -top-[21px] h-[182px] w-[341px] max-w-none"
                    />
                  </div>

                  <div className="w-full space-y-2.5">
                    <h2
                      id={titleId}
                      className="text-[31px] font-bold leading-normal text-text-primary"
                    >
                      Congratulations!
                    </h2>
                    <p
                      id={descriptionId}
                      className="text-[15px] leading-normal text-text-secondary"
                    >
                      You&apos;ve completed today&apos;s challenge.
                    </p>
                  </div>

                  <button
                    ref={primaryButtonRef}
                    type="button"
                    onClick={closeDialog}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#c1fb6d] px-8 py-3.5 text-[15px] font-semibold text-[#071a3c] transition-colors hover:bg-[#b5f45a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#071a3c] focus-visible:ring-offset-2 motion-reduce:transition-none"
                  >
                    <Image
                      src={`${assetRoot}/completion-arrow.svg`}
                      alt=""
                      width={16}
                      height={16}
                      aria-hidden="true"
                    />
                    Great!
                  </button>
                </div>
              ) : (
                <div
                  ref={dialogRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={titleId}
                  aria-describedby={descriptionId}
                  className="relative max-h-[calc(100dvh-2rem)] w-full max-w-[525px] overflow-y-auto rounded-2xl border border-border bg-card p-6 text-left text-text-primary shadow-2xl sm:p-[26px]"
                >
                  <button
                    type="button"
                    onClick={closeDialog}
                    aria-label="Close participation details"
                    className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a1640] focus-visible:ring-offset-2 sm:right-5 sm:top-4"
                  >
                    <Image
                      src={`${assetRoot}/incomplete-close.svg`}
                      alt=""
                      width={20}
                      height={20}
                      aria-hidden="true"
                      className="dark:brightness-0 dark:invert"
                    />
                  </button>

                  <div className="relative pr-10 sm:min-h-[126px] sm:pr-[185px]">
                    <div className="flex items-center gap-1.5">
                      <Image
                        src={`${assetRoot}/incomplete-indicator.svg`}
                        alt=""
                        width={8}
                        height={8}
                        aria-hidden="true"
                      />
                      <p className="text-[10px] font-bold uppercase text-text-primary">
                        Daily Lottery
                      </p>
                    </div>
                    <h2
                      id={titleId}
                      className="mt-2.5 text-[23px] font-bold leading-[1.3] text-text-primary"
                    >
                      Participate in today&apos;s draw
                    </h2>
                    <div
                      className="absolute -right-1 top-9 hidden h-[139px] w-[174px] overflow-hidden sm:block"
                      aria-hidden="true"
                    >
                      <Image
                        src={`${assetRoot}/incomplete-lottery.png`}
                        alt=""
                        width={209}
                        height={178}
                        className="absolute -left-6 -top-6 h-[178px] w-[209px] max-w-none"
                      />
                    </div>
                  </div>

                  <section id={descriptionId} className="mt-1">
                    <h3 className="text-sm font-semibold text-text-primary">How to qualify</h3>
                    <div className="mt-3.5 space-y-3">
                      <QualificationStep icon="incomplete-clipboard.svg">
                        Complete 1 daily challenge
                      </QualificationStep>
                      <QualificationStep icon="incomplete-pointer.svg">
                        Click Participate
                      </QualificationStep>
                      <QualificationStep icon="incomplete-radio.svg">
                        Join the live draw event on Discord at 9:00 PM
                      </QualificationStep>
                    </div>
                  </section>

                  <div className="mt-5 flex flex-col gap-3 rounded-[13px] bg-emerald-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#fef3c7]">
                        <Image
                          src={`${assetRoot}/incomplete-trophy.svg`}
                          alt=""
                          width={15}
                          height={15}
                          aria-hidden="true"
                        />
                      </div>
                      <p className="whitespace-nowrap text-[12px] font-bold text-text-primary">
                        3 winners daily
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <PrizePill icon="incomplete-crown-1.svg">Rs. 500</PrizePill>
                      <PrizePill icon="incomplete-crown-2.svg">Rs. 300</PrizePill>
                      <PrizePill icon="incomplete-crown-3.svg">Rs. 200</PrizePill>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[13px] bg-rose-500/10 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-1.5">
                        <Image
                          src={`${assetRoot}/incomplete-lock.svg`}
                          alt=""
                          width={12}
                          height={12}
                          aria-hidden="true"
                        />
                        <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-200">
                          Complete 1 learning challenge to qualify.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Image
                          src={`${assetRoot}/incomplete-clock.svg`}
                          alt=""
                          width={10}
                          height={10}
                          aria-hidden="true"
                          className="dark:brightness-0 dark:invert"
                        />
                        <p className="whitespace-nowrap text-[9px] font-semibold text-text-primary">
                          Deadline · 8:00 PM
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2.5">
                      <span className="text-[11px] font-semibold text-text-primary">0/1</span>
                      <div
                        className="h-[5px] flex-1 overflow-hidden rounded-full bg-rose-500/15"
                        role="progressbar"
                        aria-label="Daily challenge qualification"
                        aria-valuemin={0}
                        aria-valuemax={1}
                        aria-valuenow={0}
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={closeDialog}
                      className="min-h-11 rounded-xl border border-border bg-bg-primary px-5 py-3 text-[12px] font-semibold text-text-primary transition-colors hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 motion-reduce:transition-none sm:w-[148px]"
                    >
                      Close
                    </button>
                    <button
                      ref={primaryButtonRef}
                      type="button"
                      onClick={continueToChallenge}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-5 py-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 motion-reduce:transition-none"
                    >
                      <Image
                        src={`${assetRoot}/incomplete-lock-white.svg`}
                        alt=""
                        width={12}
                        height={12}
                        aria-hidden="true"
                      />
                      Complete challenge first
                      <Image
                        src={`${assetRoot}/incomplete-arrow.svg`}
                        alt=""
                        width={12}
                        height={12}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
