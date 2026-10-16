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
  const featuredCount =
    faculties.length === 4 ? 1 : faculties.length >= 5 ? 2 : 0;
  const featuredFaculties = faculties.slice(0, featuredCount);
  const remainingFaculties = faculties.slice(featuredCount);
  const remainingCount = Math.min(remainingFaculties.length, 3);
  const renderFaculty = (faculty: ExamFaculty) => (
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
  );

  return (
    <main className="ns-ef-page">
      <header className="ns-ef-topbar">
        <Link className="ns-ef-brand" href={landingHref} aria-label="Nano Syllabus home">
          <Image src="/nanologo.png" alt="" width={42} height={42} />
          <span>Nano Syllabus</span>
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
      </section>

      <section className="ns-ef-browse" aria-label="Faculties">
        {featuredCount ? (
          <div className={`ns-ef-featured-grid ns-ef-featured-grid--${featuredCount}`}>
            {featuredFaculties.map((faculty) => renderFaculty(faculty))}
          </div>
        ) : null}
        {remainingFaculties.length ? (
          <div className={`ns-ef-grid ns-ef-grid--count-${remainingCount}`}>
            {remainingFaculties.map(renderFaculty)}
          </div>
        ) : null}
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
        .ns-ef-page { width: min(1440px, calc(100% - 64px)); min-height: 100vh; margin: 0 auto; padding-bottom: clamp(32px, 5vw, 56px); background: #fff; color: #101114; -webkit-font-smoothing: antialiased; }
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
        .ns-ef-hero { padding: clamp(32px, 5vw, 64px) 20px clamp(24px, 3vw, 40px); text-align: center; }
        .ns-ef-hero h1 { margin: 0 auto; max-width: 800px; font-size: clamp(2rem, 4vw, 3rem); line-height: 1.08; letter-spacing: -.045em; font-weight: 600; }
        .ns-ef-hero p { margin: 12px auto 0; max-width: 640px; color: #667083; font-size: clamp(.95rem, 1.4vw, 1.0625rem); line-height: 1.55; letter-spacing: -.01em; }
        .ns-ef-browse { width: 100%; max-width: 1253px; margin: clamp(20px, 3vw, 30px) auto 0; color: #171c27; }
        .ns-ef-featured-grid, .ns-ef-grid { display: grid; gap: clamp(14px, 1.5vw, 24px); }
        .ns-ef-featured-grid { margin: 0 auto clamp(14px, 1.5vw, 24px); }
        .ns-ef-featured-grid > .ns-fc, .ns-ef-grid > .ns-fc { width: 100%; min-width: 0; }
        .ns-ef-featured-grid--1 { width: min(33.333%, 420px); grid-template-columns: minmax(0, 1fr); }
        .ns-ef-featured-grid--2 { width: min(72%, 900px); grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .ns-ef-grid--count-1 { width: min(33.333%, 420px); margin: 0 auto; grid-template-columns: minmax(0, 1fr); }
        .ns-ef-grid--count-2 { width: min(72%, 900px); margin: 0 auto; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .ns-ef-grid--count-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .ns-ef-continue { display: flex; justify-content: center; margin-top: clamp(24px, 3vw, 36px); }
        .ns-ef-cta { display: inline-flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 26px; border: 0; border-radius: 10px; background: #3049ed; color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; transition: background .2s; }
        .ns-ef-cta:hover:not(:disabled) { background: #2439d0; }
        .ns-ef-cta:disabled { opacity: .45; cursor: not-allowed; }
        .ns-ef-cta svg { width: 16px; height: 16px; }
        .ns-ef-cta:focus-visible, .ns-ef-back:focus-visible { outline: 3px solid #9aafff; outline-offset: 3px; }
        @media (max-width: 1100px) {
          .ns-ef-featured-grid--1, .ns-ef-grid--count-1 { width: min(42%, 420px); }
          .ns-ef-featured-grid--2, .ns-ef-grid--count-2 { width: min(88%, 900px); }
        }
        @media (max-width: 800px) {
          .ns-ef-page { width: min(calc(100% - 28px), 720px); }
          .ns-ef-topbar { height: 70px; }
          .ns-ef-hero { padding: 36px 12px 26px; }
          .ns-ef-featured-grid, .ns-ef-grid { gap: 14px; }
          .ns-ef-featured-grid--1, .ns-ef-featured-grid--2,
          .ns-ef-grid--count-1, .ns-ef-grid--count-2, .ns-ef-grid--count-3 {
            width: min(100%, 420px);
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 560px) {
          .ns-ef-page { width: min(calc(100% - 20px), 520px); }
          .ns-ef-hero { padding: 30px 8px 22px; }
          .ns-ef-cta { width: 100%; justify-content: center; }
        }
      `}</style>
    </main>
  );
}
