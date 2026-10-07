"use client";

import Image from "next/image";
import Link from "next/link";
import { ExamFacultyCard } from "@/components/exam-faculty-card";
import type { ExamFaculty } from "@/lib/data/exam-enrollment";
import { EXISTING_STUDENT_LOGIN } from "@/lib/exam-enrollment";

/**
 * "Find your faculty" for an exam, laid out like the Browse communities page:
 * top bar, hero and the two-column card grid (no filters or search). It lists
 * only the faculties the admin chose for this exam. Joining records the choice; the student has no account yet.
 */
export function ExamFacultyBrowse({
  title,
  description,
  landingHref,
  faculties,
  selectedSlug,
  onSelect,
  continueLabel,
  onContinue,
  onBack,
  backLabel,
}: {
  title: string;
  description: string;
  landingHref: string;
  faculties: ExamFaculty[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
  continueLabel: string;
  onContinue: () => void;
  /** Omitted = Back returns to the landing page. */
  onBack?: () => void;
  backLabel: string;
}) {
  return (
    <main className="ns-ef-page">
      <header className="ns-ef-topbar">
        <Link className="ns-ef-brand" href={landingHref} aria-label="Nano Syllabus home">
          <Image src="/nanologo.png" alt="" width={42} height={42} />
          <span>NanoSyllabus</span>
        </Link>
        <div className="ns-ef-topbar-actions">
          {onBack ? (
            <button type="button" className="ns-ef-back" onClick={onBack}>
              ← {backLabel}
            </button>
          ) : (
            <Link className="ns-ef-back" href={landingHref}>
              ← {backLabel}
            </Link>
          )}
          {/* A returning student never has to redo onboarding to get back in. */}
          <Link className="ns-ef-login" href={EXISTING_STUDENT_LOGIN}>
            <span className="ns-ef-login-hint">Already joined?</span> <strong>Log in</strong>
          </Link>
        </div>
      </header>

      <section className="ns-ef-hero" aria-labelledby="ns-ef-title">
        <div>
          <h1 id="ns-ef-title">{title}</h1>
          <p>{description}</p>
        </div>
        <div className="ns-ef-hero-art" aria-hidden="true">
          <svg
            viewBox="0 0 120 120"
            fill="none"
            stroke="#101114"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="60" cy="36" r="13" />
            <circle cx="29" cy="45" r="10" />
            <circle cx="91" cy="45" r="10" />
            <path d="M37 89V76c0-14 10-24 23-24s23 10 23 24v13H37ZM11 83V70c0-10 8-18 18-18 5 0 9 2 12 5M109 83V70c0-10-8-18-18-18-5 0-9 2-12 5" />
          </svg>
        </div>
      </section>

      <section className="ns-ef-browse" aria-label="Faculties">
        <div className="ns-ef-grid">
          {faculties.map((faculty) => (
            <ExamFacultyCard
              key={faculty.id}
              slug={faculty.slug}
              name={faculty.name}
              faculty={faculty.faculty}
              university={faculty.university}
              subjects={faculty.subjects}
              selected={selectedSlug === faculty.slug}
              onJoin={() => onSelect(faculty.slug)}
            />
          ))}
        </div>
      </section>

      <div className="ns-ef-continue">
        <button type="button" className="ns-ef-cta" onClick={onContinue} disabled={!selectedSlug}>
          {continueLabel}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M4 12h15m-6-6 6 6-6 6" />
          </svg>
        </button>
      </div>

      <style>{`
        .ns-ef-page { width: min(1440px, calc(100% - 64px)); min-height: 100vh; margin: 0 auto; padding-bottom: 56px; background: #fff; color: #101114; -webkit-font-smoothing: antialiased; }
        .ns-ef-topbar { height: 80px; display: flex; align-items: center; justify-content: space-between; }
        .ns-ef-brand { display: inline-flex; align-items: center; gap: 12px; color: #101114; text-decoration: none; font-size: 1.375rem; font-weight: 600; letter-spacing: -.04em; }
        .ns-ef-brand img { width: 42px; height: 42px; }
        .ns-ef-back { display: inline-flex; align-items: center; gap: 6px; padding: 8px 4px; border: 0; background: none; color: #667083; font-size: 14px; font-weight: 700; cursor: pointer; text-decoration: none; }
        .ns-ef-back:hover { color: #101114; }
        .ns-ef-topbar-actions { display: flex; align-items: center; gap: 18px; }
        .ns-ef-login { min-height: 40px; display: inline-flex; align-items: center; gap: 4px; padding: 0 14px; border: 1px solid #d9dde5; border-radius: 10px; color: #667083; font-size: 13.5px; text-decoration: none; white-space: nowrap; }
        .ns-ef-login strong { color: #2563eb; font-weight: 700; }
        .ns-ef-login:hover { border-color: #2563eb; }
        .ns-ef-login:focus-visible { outline: 3px solid #9aafff; outline-offset: 3px; }
        @media (max-width: 520px) { .ns-ef-topbar-actions { gap: 10px; } .ns-ef-login { padding: 0 10px; } .ns-ef-login-hint { display: none; } }
        .ns-ef-hero { min-height: 190px; padding: 36px 50px; display: grid; grid-template-columns: minmax(0, 1fr) 170px; align-items: center; gap: 32px; overflow: hidden; border-radius: 15px; background: #dcfa72; }
        .ns-ef-hero h1 { margin: 0; max-width: 800px; font-size: clamp(2.25rem, 3.2vw, 3.25rem); line-height: 1; letter-spacing: -.045em; font-weight: 600; }
        .ns-ef-hero p { margin: 14px 0 0; max-width: 640px; color: #313329; font-size: 1.125rem; line-height: 1.5; letter-spacing: -.01em; }
        .ns-ef-hero-art { width: 140px; aspect-ratio: 1; justify-self: end; display: grid; place-items: center; border-radius: 28px; background: #fff; }
        .ns-ef-hero-art svg { width: 90px; height: 90px; }
        .ns-ef-browse { margin-top: 30px; color: #171c27; }
        .ns-ef-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
        .ns-ef-continue { display: flex; justify-content: center; margin-top: 36px; }
        .ns-ef-cta { display: inline-flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 26px; border: 0; border-radius: 10px; background: #3049ed; color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; transition: background .2s; }
        .ns-ef-cta:hover:not(:disabled) { background: #2439d0; }
        .ns-ef-cta:disabled { opacity: .45; cursor: not-allowed; }
        .ns-ef-cta svg { width: 16px; height: 16px; }
        .ns-ef-cta:focus-visible, .ns-ef-back:focus-visible { outline: 3px solid #9aafff; outline-offset: 3px; }
        @media (max-width: 1100px) { .ns-ef-grid { grid-template-columns: 1fr; } }
        @media (max-width: 800px) {
          .ns-ef-page { width: min(100% - 28px, 720px); }
          .ns-ef-topbar { height: 70px; }
          .ns-ef-hero { min-height: auto; grid-template-columns: 1fr; padding: 28px; }
          .ns-ef-hero-art { display: none; }
          .ns-ef-grid { gap: 14px; }
        }
        @media (max-width: 560px) {
          .ns-ef-page { width: min(100% - 20px, 520px); }
          .ns-ef-hero { padding: 24px 20px; }
          .ns-ef-cta { width: 100%; justify-content: center; }
        }
      `}</style>
    </main>
  );
}
