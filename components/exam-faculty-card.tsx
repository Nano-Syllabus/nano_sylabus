"use client";

import { Check } from "lucide-react";

const TINTS = ["blue", "mint", "purple", "amber", "rose"] as const;

/** Stable tint per faculty, so a card keeps its colour (same rule as Browse communities). */
function tint(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  return TINTS[Math.abs(hash) % TINTS.length];
}

/** "BCT", "CSIT" when the name carries an acronym, otherwise initials. */
function monogram(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const acronym = words.find((word) => /^[A-Z]{2,4}$/.test(word));
  if (acronym) return acronym;
  return (
    (words.length > 1
      ? words
          .slice(0, 3)
          .map((word) => word[0])
          .join("")
      : name.slice(0, 3)
    ).toUpperCase() || "NS"
  );
}

/**
 * A faculty on the exam's "Find your faculty" step, drawn like a card on the
 * Browse communities page. Joining here only records the choice: the student has
 * no account yet, and the faculty is locked to them once they sign in.
 */
export function ExamFacultyCard({
  slug,
  name,
  faculty,
  university,
  subjects,
  selected,
  onJoin,
}: {
  slug: string;
  name: string;
  faculty: string | null;
  university: string | null;
  subjects: Array<{ id: string; name: string }>;
  selected: boolean;
  onJoin: () => void;
}) {
  return (
    <article className={`ns-fc ns-fc--${tint(slug)} ${selected ? "ns-fc--selected" : ""}`}>
      <div className="ns-fc-inner">
        <div className="ns-fc-top">
          <div className="ns-fc-monogram" aria-hidden="true">
            {monogram(name)}
          </div>
          <span className="ns-fc-tag">Faculty</span>
        </div>

        <div>
          <h3 className="ns-fc-title">
            {name}
            {selected ? <span className="ns-fc-badge">✓ Your faculty</span> : null}
          </h3>
          <p className="ns-fc-subtitle">
            {[faculty, university].filter(Boolean).join(" · ") || " "}
          </p>
        </div>

        <div className="ns-fc-meta">
          <span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z" />
            </svg>
            <strong>
              {subjects.length} subject{subjects.length === 1 ? "" : "s"}
            </strong>
          </span>
        </div>

        {subjects.length ? (
          <details className="ns-fc-subjects">
            <summary>See subjects</summary>
            <ul>
              {subjects.map((subject) => (
                <li key={subject.id}>
                  <Check size={12} aria-hidden="true" /> {subject.name}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="ns-fc-bottom">
          <span />
          <button
            type="button"
            className="ns-fc-open"
            onClick={onJoin}
            aria-pressed={selected}
            aria-label={selected ? `${name} is your faculty` : `Join ${name}`}
          >
            {selected ? "Selected" : "Join"}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d={selected ? "M5 12.5 10 17l9-10" : "M4 12h15m-6-6 6 6-6 6"} />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        .ns-fc { position: relative; min-height: 270px; overflow: hidden; border: 1px solid #e6e9f0; border-radius: 22px; background: #fff; box-shadow: 0 3px 8px rgba(22,34,71,.025); transition: transform .25s, box-shadow .25s, border-color .25s; text-align: left; }
        .ns-fc:hover { transform: translateY(-4px); box-shadow: 0 18px 38px rgba(31,46,91,.09); border-color: #cbd4fa; }
        .ns-fc--selected { border-color: #3158e9; box-shadow: 0 0 0 1px #3158e9, 0 18px 38px rgba(31,46,91,.09); }
        .ns-fc::before { content: ""; position: absolute; inset: 0 0 auto; height: 94px; background: var(--wash); }
        .ns-fc::after { content: ""; position: absolute; width: 185px; height: 185px; right: -42px; top: -79px; border: 1px solid var(--arc); border-radius: 50%; box-shadow: 0 0 0 29px var(--halo), 0 0 0 58px var(--halo); pointer-events: none; }
        .ns-fc--blue { --wash: #eff3ff; --arc: #cedafa; --halo: #e7edff; --accent: #3158e9; }
        .ns-fc--mint { --wash: #eaf8f3; --arc: #bee9d8; --halo: #e1f4ed; --accent: #177d65; }
        .ns-fc--purple { --wash: #f3efff; --arc: #ded3fa; --halo: #ede7fb; --accent: #7454c5; }
        .ns-fc--amber { --wash: #fff4e7; --arc: #f6dfba; --halo: #fff0dc; --accent: #b46b1d; }
        .ns-fc--rose { --wash: #fff0f2; --arc: #f8d7dd; --halo: #ffebef; --accent: #c04d68; }
        .ns-fc-inner { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 270px; padding: 24px 25px 23px; }
        .ns-fc-top { height: 74px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .ns-fc-monogram { display: grid; place-items: center; width: 55px; height: 55px; border: 1px solid rgba(255,255,255,.85); border-radius: 17px; background: #fff; box-shadow: 0 7px 18px rgba(31,46,91,.08); color: var(--accent); font-size: 17px; font-weight: 800; letter-spacing: -.04em; }
        .ns-fc-tag { padding: 7px 11px; border: 1px solid rgba(255,255,255,.9); border-radius: 999px; background: rgba(255,255,255,.74); color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; backdrop-filter: blur(5px); }
        .ns-fc-title { margin: 4px 0 5px; font-size: 22px; font-weight: 800; line-height: 1.26; letter-spacing: -.04em; overflow-wrap: anywhere; color: #111; }
        .ns-fc-badge { display: inline-flex; align-items: center; margin-left: 8px; padding: 5px 9px; border-radius: 999px; background: #e9f7ef; color: #23804e; font-size: 11px; font-weight: 800; letter-spacing: 0; vertical-align: 4px; }
        .ns-fc-subtitle { margin: 0; font-size: 14px; line-height: 1.45; color: #667083; }
        .ns-fc-meta { display: flex; flex-wrap: wrap; gap: 8px 15px; margin-top: 22px; font-size: 13px; color: #616b7d; }
        .ns-fc-meta span { display: inline-flex; align-items: center; gap: 6px; }
        .ns-fc-meta svg { color: #8290a9; }
        .ns-fc-meta strong { color: #384354; font-weight: 700; }
        .ns-fc-subjects { margin-top: 12px; font-size: 13px; color: #384354; }
        .ns-fc-subjects summary { cursor: pointer; font-weight: 700; color: var(--accent); }
        .ns-fc-subjects ul { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 5px; }
        .ns-fc-subjects li { display: flex; align-items: center; gap: 6px; }
        .ns-fc-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 21px; }
        .ns-fc-open { display: inline-flex; align-items: center; gap: 9px; padding: 10px 13px; border: 0; border-radius: 10px; background: #212b48; color: #fff; font-size: 13px; font-weight: 800; white-space: nowrap; cursor: pointer; transition: background .2s, transform .2s; }
        .ns-fc-open:hover { background: #3158f4; transform: translateX(2px); }
        .ns-fc--selected .ns-fc-open { background: #3158e9; }
        .ns-fc-open svg { width: 16px; height: 16px; }
        .ns-fc-open:focus-visible { outline: 3px solid #9aafff; outline-offset: 3px; }
      `}</style>
    </article>
  );
}
