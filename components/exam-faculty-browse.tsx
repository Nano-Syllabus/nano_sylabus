"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ExamFacultyCard } from "@/components/exam-faculty-card";
import type { ExamFaculty } from "@/lib/data/exam-enrollment";
import { EXISTING_STUDENT_LOGIN } from "@/lib/exam-enrollment";

/**
 * "Find your faculty" for an exam, laid out like the Browse communities page:
 * top bar, hero, a "Browse faculties" header with count and search, and the
 * two-column card grid. It lists only the faculties the admin chose for this
 * exam. Joining records the choice; the student has no account yet.
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
  const [query, setQuery] = useState("");
  const [university, setUniversity] = useState("");
  const [faculty, setFaculty] = useState("");
  const needle = query.trim().toLowerCase();
  const universities = [
    ...new Set(faculties.map((f) => f.university?.trim()).filter(Boolean)),
  ].sort();
  const facultyNames = [...new Set(faculties.map((f) => f.faculty?.trim()).filter(Boolean))].sort();
  const visible = faculties.filter(
    (f) =>
      (!university || f.university?.trim() === university) &&
      (!faculty || f.faculty?.trim() === faculty) &&
      (!needle ||
        [f.name, f.faculty, f.university, ...f.subjects.map((subject) => subject.name)].some(
          (part) => part?.toLowerCase().includes(needle),
        )),
  );
  const hasFilters = Boolean(needle || university || faculty);
  function clearFilters() {
    setQuery("");
    setUniversity("");
    setFaculty("");
  }

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

      <section className="ns-ef-browse" aria-label="Browse faculties">
        <aside className="ns-ef-filters" aria-label="Faculty filters">
          <div className="ns-ef-filters-header">
            <h2>Filters</h2>
            <button type="button" onClick={clearFilters} disabled={!hasFilters}>
              Clear
            </button>
          </div>
          <div className="ns-ef-filter-fields">
            <label className="ns-ef-filter" htmlFor="exam-filter-university">
              University
              <select
                id="exam-filter-university"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
              >
                <option value="">All universities</option>
                {universities.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ns-ef-filter" htmlFor="exam-filter-faculty">
              Faculty
              <select
                id="exam-filter-faculty"
                value={faculty}
                onChange={(e) => setFaculty(e.target.value)}
              >
                <option value="">All faculties</option>
                {facultyNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </aside>
        <div className="ns-ef-results">
          <div className="ns-ef-intro">
            <div className="ns-ef-heading">
              <h2>Browse faculties</h2>
              <span className="ns-ef-count" aria-live="polite">
                {visible.length} {visible.length === 1 ? "faculty" : "faculties"}
              </span>
            </div>
            <label className="ns-ef-search">
              <span className="sr-only">Search faculties</span>
              <svg
                width="17"
                height="17"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="10.8" cy="10.8" r="7.4" />
                <path d="m16.5 16.5 5 5" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search faculty, university or subject"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="ns-ef-grid">
            {visible.map((faculty) => (
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
          {!visible.length ? (
            <div className="ns-ef-empty" role="status">
              <h3>No faculties found</h3>
              <p>Try another search or clear your filters.</p>
              <button type="button" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : null}
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
        .ns-ef-browse { display: grid; grid-template-columns: 240px minmax(0, 1fr); align-items: start; gap: 28px; margin-top: 30px; color: #171c27; }
        .ns-ef-filters { padding: 22px 20px; border: 1px solid #e6e9f0; border-radius: 16px; background: #fafbf8; }
        .ns-ef-filters-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
        .ns-ef-filters h2 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -.02em; }
        .ns-ef-filters button, .ns-ef-empty button { border: 0; background: none; color: #314acf; font-size: 13px; font-weight: 700; cursor: pointer; }
        .ns-ef-filters button:disabled { color: #8490a2; cursor: default; }
        .ns-ef-filter-fields { display: grid; gap: 20px; }
        .ns-ef-filter { display: grid; gap: 8px; min-width: 0; font-size: 13px; font-weight: 700; color: #384354; }
        .ns-ef-filter select { width: 100%; min-width: 0; min-height: 42px; padding: 9px 10px; border: 1px solid #dce1d6; border-radius: 9px; background: #fff; color: #171c27; font-size: 13px; font-weight: 500; cursor: pointer; }
        .ns-ef-filter select:focus-visible { outline: 3px solid #e9edff; border-color: #a5b4fc; }
        .ns-ef-results { min-width: 0; }
        .ns-ef-intro { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
        .ns-ef-heading { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .ns-ef-heading h2 { margin: 0; font-size: clamp(24px, 2.2vw, 30px); font-weight: 800; line-height: 1.15; letter-spacing: -.045em; white-space: nowrap; }
        .ns-ef-count { padding: 5px 10px; border-radius: 999px; background: #ebefff; color: #314acf; font-size: 12px; font-weight: 800; white-space: nowrap; }
        .ns-ef-search { position: relative; flex: 0 1 320px; min-width: 0; }
        .ns-ef-search svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #8490a2; pointer-events: none; }
        .ns-ef-search input { width: 100%; height: 40px; padding: 0 12px 0 37px; border: 1px solid #e6e9f0; border-radius: 10px; background: #fff; color: #171c27; font-size: 14px; outline: none; transition: border-color .2s, box-shadow .2s; }
        .ns-ef-search input:focus { border-color: #a5b4fc; box-shadow: 0 0 0 3px #e9edff; }
        .ns-ef-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
        .ns-ef-empty { padding: 32px 20px; border: 1px solid #e6e9f0; border-radius: 16px; text-align: center; color: #667083; font-size: 14px; }
        .ns-ef-empty h3 { margin: 0; color: #171c27; font-size: 18px; font-weight: 700; }
        .ns-ef-empty p { margin: 8px 0 16px; }
        .ns-ef-continue { display: flex; justify-content: center; margin-top: 36px; }
        .ns-ef-cta { display: inline-flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 26px; border: 0; border-radius: 10px; background: #3049ed; color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; transition: background .2s; }
        .ns-ef-cta:hover:not(:disabled) { background: #2439d0; }
        .ns-ef-cta:disabled { opacity: .45; cursor: not-allowed; }
        .ns-ef-cta svg { width: 16px; height: 16px; }
        .ns-ef-cta:focus-visible, .ns-ef-back:focus-visible { outline: 3px solid #9aafff; outline-offset: 3px; }
        @media (max-width: 1200px) { .ns-ef-intro { flex-direction: column; align-items: stretch; } .ns-ef-search { flex-basis: auto; } }
        @media (max-width: 1100px) { .ns-ef-grid { grid-template-columns: 1fr; } }
        @media (max-width: 800px) {
          .ns-ef-page { width: min(100% - 28px, 720px); }
          .ns-ef-topbar { height: 70px; }
          .ns-ef-hero { min-height: auto; grid-template-columns: 1fr; padding: 28px; }
          .ns-ef-hero-art { display: none; }
          .ns-ef-grid { gap: 14px; }
          .ns-ef-browse { grid-template-columns: 1fr; gap: 20px; }
          .ns-ef-filters { padding: 18px; }
          .ns-ef-filters-header { margin-bottom: 16px; }
          .ns-ef-filter-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        }
        @media (max-width: 560px) {
          .ns-ef-page { width: min(100% - 20px, 520px); }
          .ns-ef-hero { padding: 24px 20px; }
          .ns-ef-intro { flex-direction: column; align-items: stretch; gap: 12px; }
          .ns-ef-search { flex-basis: auto; }
          .ns-ef-cta { width: 100%; justify-content: center; }
        }
      `}</style>
    </main>
  );
}
