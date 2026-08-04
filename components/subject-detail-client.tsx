"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { findNanoSubject, NANO_OWN_STUDY, type KnowledgeLevel, type NanoMaterial, type NanoStudentSubject, type NanoTopic } from "@/lib/nano-student-subjects";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";
const button = `inline-flex min-h-10 items-center justify-center rounded-[10px] border px-4 text-sm font-medium transition ${focusRing}`;

function Dot({ level }: { level: KnowledgeLevel }) {
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full border border-border-strong/30 ${{ green: "bg-success", yellow: "bg-warning", red: "bg-destructive", grey: "bg-bg-tertiary" }[level]}`} aria-hidden="true" />;
}

function levelWord(level: KnowledgeLevel) {
  return { green: "Solid", yellow: "Getting there", red: "Struggling", grey: "Not started" }[level];
}

const chatLevels: Record<string, KnowledgeLevel> = {
  "Biot–Savart law": "green",
  "Ampère's law": "yellow",
  "Force on a wire": "grey",
  "Torque on a loop": "yellow",
  "Faraday's law": "green",
  "Lenz's law": "yellow",
  "Self inductance": "yellow",
  "Mutual inductance": "grey",
  Interference: "green",
  "Double slit": "green",
  "Diffraction grating": "yellow",
  Polarisation: "grey",
  "Photoelectric effect": "yellow",
  "de Broglie waves": "grey",
  "The angle in the formula": "yellow",
  "The minus sign in Lenz's law": "yellow",
  "Units and constants": "grey",
};

const dependency: Record<string, string> = {
  "Torque on a loop": "Force on a wire",
  "Lenz's law": "Faraday's law",
  "Double slit": "Interference",
  "Inverse transform": "Laplace transform",
  "Maxwell's equations": "Gauss's law",
};

const svgFill: Record<KnowledgeLevel, string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  grey: "var(--bg-tertiary)",
};

function wrapLabel(text: string, max: number) {
  const lines = [""];
  for (const word of text.split(" ")) {
    const next = `${lines[lines.length - 1]} ${word}`.trim();
    if (next.length <= max) lines[lines.length - 1] = next;
    else lines.push(word);
  }
  return lines.slice(0, 2);
}

function sourceLevel(topic: NanoTopic, source: "tests" | "chat") {
  return source === "tests" ? topic.level : (chatLevels[topic.name] ?? topic.level);
}

type GraphNode =
  | { kind: "chapter"; label: string; x: number; y: number }
  | { kind: "topic"; label: string; x: number; y: number; level: KnowledgeLevel; index: number };

type GraphEdge = { x1: number; y1: number; x2: number; y2: number; width: number; opacity: number; dashed?: boolean };

function SubjectMap({ subject, source, selectedTopic, onSelect }: { subject: NanoStudentSubject; source: "tests" | "chat"; selectedTopic: number | null; onSelect: (index: number) => void }) {
  const graph = useMemo(() => {
    const chapterNames = [...new Set(subject.topics.map((topic) => topic.chapter))];
    const cx = 500;
    const cy = 360;
    const rx = 232;
    const ry = 150;
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const positions = new Map<string, { x: number; y: number }>();
    const start = chapterNames.length === 2 ? 0 : -Math.PI / 2;

    chapterNames.forEach((chapter, chapterIndex) => {
      const angle = start + chapterIndex * 2 * Math.PI / chapterNames.length;
      const chapterX = cx + rx * Math.cos(angle);
      const chapterY = cy + ry * Math.sin(angle);
      edges.push({ x1: cx, y1: cy, x2: chapterX, y2: chapterY, width: 1.6, opacity: 0.3 });
      nodes.push({ kind: "chapter", label: chapter, x: chapterX, y: chapterY });
      const topicRows = subject.topics.map((topic, index) => ({ topic, index })).filter((row) => row.topic.chapter === chapter);
      const spread = Math.PI * (topicRows.length > 4 ? 1.1 : 0.95);
      topicRows.forEach(({ topic, index }, topicIndex) => {
        const topicAngle = topicRows.length === 1 ? angle : angle - spread / 2 + topicIndex * spread / (topicRows.length - 1);
        const radius = 104 + (topicIndex % 2 ? 34 : 0);
        const x = chapterX + radius * Math.cos(topicAngle);
        const y = chapterY + radius * Math.sin(topicAngle);
        positions.set(topic.name, { x, y });
        edges.push({ x1: chapterX, y1: chapterY, x2: x, y2: y, width: 1, opacity: 0.2 });
        nodes.push({ kind: "topic", label: topic.name, x, y, level: sourceLevel(topic, source), index });
      });
    });

    Object.entries(dependency).forEach(([child, parent]) => {
      const from = positions.get(parent);
      const to = positions.get(child);
      if (from && to) edges.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, width: 1.2, opacity: 0.4, dashed: true });
    });

    const xs = nodes.map((node) => node.x).concat(cx);
    const ys = nodes.map((node) => node.y).concat(cy);
    return {
      cx,
      cy,
      nodes,
      edges,
      viewBox: `${Math.min(...xs) - 82} ${Math.min(...ys) - 56} ${Math.max(...xs) - Math.min(...xs) + 164} ${Math.max(...ys) - Math.min(...ys) + 118}`,
    };
  }, [source, subject]);

  const titleLines = wrapLabel(subject.title, 15);

  return (
    <svg viewBox={graph.viewBox} role="img" aria-label={`Topic map for ${subject.title}`} className="block h-auto w-full">
      <g>
        {graph.edges.map((edge, index) => <line key={index} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke="var(--text-primary)" strokeWidth={edge.width} opacity={edge.opacity} strokeDasharray={edge.dashed ? "4 4" : undefined} />)}
      </g>
      <g>
        <circle cx={graph.cx} cy={graph.cy} r="34" fill="var(--text-primary)" />
        {titleLines.map((line, index) => <text key={line} x={graph.cx} y={graph.cy - (titleLines.length - 1) * 7 + index * 14 + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--bg-primary)">{line}</text>)}
      </g>
      <g>
        {graph.nodes.map((node) => {
          if (node.kind === "chapter") {
            const lines = wrapLabel(node.label, 17);
            return <g key={`chapter-${node.label}`}><circle cx={node.x} cy={node.y} r="15" fill="var(--bg-primary)" stroke="var(--text-primary)" strokeWidth="1.6" />{lines.map((line, index) => <text key={line} x={node.x} y={node.y + 32 + index * 13} textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--text-primary)">{line}</text>)}</g>;
          }
          const radius = node.level === "grey" ? 9 : 13;
          const lines = wrapLabel(node.label, 15);
          return <g key={`topic-${node.label}`} role="button" tabIndex={0} aria-label={`${node.label}: ${levelWord(node.level)}`} onClick={() => onSelect(node.index)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.index); } }} className="cursor-pointer focus:outline-none">
            {selectedTopic === node.index ? <circle cx={node.x} cy={node.y} r={radius + 7} fill="none" stroke="var(--text-primary)" strokeWidth="1.5" /> : null}
            <circle cx={node.x} cy={node.y} r={radius} fill={svgFill[node.level]} stroke={node.level === "grey" ? "var(--text-muted)" : "var(--text-primary)"} strokeWidth={node.level === "grey" ? 1 : 1.4} strokeDasharray={node.level === "grey" ? "3 3" : undefined} />
            {lines.map((line, index) => <text key={line} x={node.x} y={node.y + radius + 15 + index * 12} textAnchor="middle" fontSize="11.5" fill="var(--text-secondary)">{line}</text>)}
          </g>;
        })}
      </g>
    </svg>
  );
}

function verdict(tests: KnowledgeLevel, questions: KnowledgeLevel) {
  if (tests === "grey" && questions === "grey") return "You haven't been near this one. Worth twenty minutes before it turns up in a test.";
  if (tests === "grey") return "You've asked about this but never been tested on it. A short practice set would tell you where you stand.";
  if (questions === "grey" && tests === "red") return "You keep losing marks here and you've never asked about it. Start with a question to the tutor.";
  if (tests === "red" && questions === "green") return "You follow the explanation, then lose it under exam conditions. That's practice, not understanding.";
  if (tests === "green") return "Solid. Leave it alone and spend the time on something red.";
  return "Coming along. One more round of questions should settle it.";
}

function DisagreementSection({ subject, encodedTitle }: { subject: NanoStudentSubject; encodedTitle: string }) {
  const askedNotTested = subject.topics.filter((topic) => sourceLevel(topic, "chat") !== "grey" && topic.level === "grey");
  const weakNotAsked = subject.topics.filter((topic) => topic.level === "red" && sourceLevel(topic, "chat") === "grey");
  const both = subject.topics.filter((topic) => topic.level === "red" && sourceLevel(topic, "chat") === "yellow");

  if (!askedNotTested.length && !weakNotAsked.length && !both.length) return null;

  const renderBlock = (title: string, list: NanoTopic[], note: string) => {
    if (!list.length) return null;
    return (
      <div className="rounded-[14px] border border-border bg-bg-primary p-5 shadow-sm">
        <h3 className="font-display text-[17px] font-semibold">{title}</h3>
        <hr className="my-3 border-border" />
        <div className="space-y-2">
          {list.map((topic) => (
            <div key={topic.name} className="flex items-center gap-2 border-b border-border pb-2.5 last:border-0">
              <Dot level={topic.level} />
              <span className="text-[13px]">{topic.name}</span>
              <span className="flex-1" />
              <Link
                href={`/app/chat?subject=${encodedTitle}&topic=${encodeURIComponent(topic.name)}&mode=practice`}
                className={`${button} min-h-8 border-border bg-bg-primary px-2.5 text-xs hover:bg-bg-secondary`}
              >
                Practise
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-text-muted">{note}</p>
      </div>
    );
  };

  return (
    <section className="mt-7">
      <h2 className="font-display text-lg font-semibold">Where the two maps disagree</h2>
      <p className="mb-4 text-[13px] text-text-muted">Usually the most useful thing on this page.</p>
      <div className="grid gap-3 lg:grid-cols-3">
        {renderBlock("Asked about, never tested", askedNotTested, "You've read about these. Nothing has checked whether it stuck.")}
        {renderBlock("Losing marks, never asked", weakNotAsked, "These are costing you and you've never asked why.")}
        {renderBlock("Weak on both counts", both, "Start here.")}
      </div>
    </section>
  );
}

function KnowledgeGraph({ subject, source, setSource, selectedTopic, setSelectedTopic, encodedTitle }: { subject: NanoStudentSubject; source: "tests" | "chat"; setSource: (source: "tests" | "chat") => void; selectedTopic: number | null; setSelectedTopic: (index: number | null) => void; encodedTitle: string }) {
  const levels = subject.topics.map((topic) => sourceLevel(topic, source));
  const selected = selectedTopic === null ? null : subject.topics[selectedTopic];
  return <>
    <div className="mb-4 flex flex-wrap items-center gap-3"><div className="inline-flex overflow-hidden rounded-[10px] border border-border bg-bg-primary"><button type="button" onClick={() => setSource("tests")} className={`min-h-10 px-4 text-[13px] ${focusRing} ${source === "tests" ? "bg-text-primary font-medium text-text-inverse" : "text-text-secondary"}`}>From your tests</button><button type="button" onClick={() => setSource("chat")} className={`min-h-10 border-l border-border px-4 text-[13px] ${focusRing} ${source === "chat" ? "bg-text-primary font-medium text-text-inverse" : "text-text-secondary"}`}>From your questions</button></div><p className="text-[13px] text-text-muted">{source === "tests" ? "Built from how you answered test questions." : "Built from what you ask the tutor."}</p></div>
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_306px]">
      <section className="overflow-hidden rounded-[14px] border border-border bg-bg-primary shadow-sm"><SubjectMap subject={subject} source={source} selectedTopic={selectedTopic} onSelect={setSelectedTopic} /></section>
      <aside className="space-y-3">{selected ? <div className="rounded-[14px] border border-border bg-bg-primary p-5 shadow-sm"><div className="flex items-center"><span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">{selected.chapter}</span><span className="flex-1"/><button type="button" onClick={() => setSelectedTopic(null)} className={`min-h-10 px-2 text-xs text-text-secondary hover:underline ${focusRing}`}>Clear</button></div><h3 className="mt-3 font-display text-[17px] font-semibold">{selected.name}</h3><hr className="my-3 border-border"/>{[["From your tests", selected.level], ["From your questions", sourceLevel(selected, "chat")]] .map(([label, level]) => <div key={label} className="flex items-center gap-2 border-b border-border py-2.5 last:border-0"><Dot level={level as KnowledgeLevel}/><span className="text-[13px]">{label}</span><span className="flex-1"/><b className="text-[13px]">{levelWord(level as KnowledgeLevel)}</b></div>)}<p className="my-3 text-[13px] text-text-muted">{verdict(selected.level, sourceLevel(selected, "chat"))}</p><div className="flex flex-wrap gap-2"><Link href={`/app/chat?subject=${encodedTitle}&topic=${encodeURIComponent(selected.name)}&mode=practice`} className={`${button} min-h-9 border-border-strong bg-text-primary px-3 text-xs text-text-inverse`}>Practise this</Link><Link href={`/app/chat?subject=${encodedTitle}&topic=${encodeURIComponent(selected.name)}`} className={`${button} min-h-9 border-border bg-bg-primary px-3 text-xs`}>Ask about it</Link></div></div> : <><div className="rounded-[14px] border border-border bg-bg-primary p-5 shadow-sm"><h3 className="font-display text-[17px] font-semibold">How to read it</h3><hr className="my-3 border-border"/><div className="flex flex-wrap gap-x-4 gap-y-2">{(["red", "yellow", "green", "grey"] as KnowledgeLevel[]).map((level) => <div key={level} className="flex items-center gap-2 text-[13px]"><Dot level={level}/>{levelWord(level)}</div>)}</div><p className="mt-3 text-[13px] text-text-muted">Dotted lines join topics that build on each other. Tap any topic for the detail.</p></div><div className="rounded-[14px] border border-border bg-bg-primary p-5 shadow-sm"><h3 className="font-display text-[17px] font-semibold">Where you stand</h3><hr className="my-3 border-border"/>{(["green", "yellow", "red", "grey"] as KnowledgeLevel[]).map((level) => <div key={level} className="flex items-center gap-2 border-b border-border py-2 last:border-0"><Dot level={level}/><span className="text-[13px]">{levelWord(level)}</span><span className="flex-1"/><b>{levels.filter((item) => item === level).length}</b></div>)}</div></>}</aside>
    </div>
    <DisagreementSection subject={subject} encodedTitle={encodedTitle} />
  </>;
}

const subjectMetadata: Record<string, { code: string; programme: string; university: string; semester: number }> = {
  "Engineering Physics I": { code: "SH 401", programme: "BE Electronics (BEI)", university: "Tribhuvan University", semester: 1 },
  "Digital Logic Design": { code: "EX 451", programme: "BE Electronics (BEI)", university: "Tribhuvan University", semester: 2 },
  "Applied Mathematics II": { code: "SH 451", programme: "BE Electronics (BEI)", university: "Tribhuvan University", semester: 2 },
  "Electromagnetic Field Theory": { code: "EX 551", programme: "BE Electronics (BEI)", university: "Tribhuvan University", semester: 4 },
};

const subjectQuestionBanks: Record<string, { name: string; size: string; found: number }[]> = {
  "Engineering Physics I": [
    { name: "IOE past papers 2072–2081.pdf", size: "8.2 MB", found: 214 },
    { name: "Model questions, board set.pdf", size: "1.9 MB", found: 48 },
  ],
};

export function SubjectDetailClient({ subject }: { subject: string }) {
  const found = findNanoSubject(subject);
  const data = found ?? { ...NANO_OWN_STUDY, slug: subject, title: decodeURIComponent(subject).replace(/-/g, " "), topics: [], blurb: "Private to you." };
  const [tab, setTab] = useState<"progress" | "syllabus" | "material" | "bank">("progress");
  const [source, setSource] = useState<"tests" | "chat">("tests");
  const [selectedTopic, setSelectedTopic] = useState<number | null>(null);
  const [material, setMaterial] = useState<NanoMaterial | null>(null);
  const encodedTitle = encodeURIComponent(data.title);

  const weakest = useMemo(() => data.topics.filter((item) => item.level === "red").slice(0, 4), [data.topics]);
  const chapters = useMemo(() => [...new Set(data.topics.map((t) => t.chapter))], [data.topics]);

  const bankItems = subjectQuestionBanks[data.title] ?? [];

  const unitList = useMemo(() => {
    return chapters.map((chapter) => ({
      name: chapter,
      topics: data.topics.filter((t) => t.chapter === chapter),
    }));
  }, [chapters, data.topics]);

  const isOwnSpace = data.mode === "personal";

  const tabs = [
    ["progress", "My progress", undefined],
    ["syllabus", isOwnSpace ? "Roadmap" : "Syllabus", chapters.length],
    ["material", "Material", data.material.length],
    ...(!isOwnSpace ? [["bank", "Question bank", bankItems.length]] : []),
  ] as const;

  useEffect(() => {
    if (!material) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setMaterial(null);
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [material]);

  const metadata = subjectMetadata[data.title] ?? { code: data.code, programme: "", university: "", semester: 1 };
  const eyebrowItems = isOwnSpace
    ? ["Your own space"]
    : [metadata.code, metadata.programme, metadata.university, `semester ${metadata.semester}`];

  return (
    <main className="w-full max-w-[1240px] px-[14px] pb-24 pt-[18px] lg:p-[26px]">
      <p className="mb-4 text-[13px] text-text-muted">
        <Link href="/app/explore" className={`hover:underline ${focusRing}`}>Subjects</Link> / <b className="text-text-secondary">{data.title}</b>
      </p>

      <div className="mb-7 flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3 font-mono-ui text-xs uppercase tracking-[0.12em] text-text-secondary">
            {eyebrowItems.filter(Boolean).map((item, index) => <span key={item} className="flex items-center gap-3">{index ? <span className="text-text-muted">·</span> : null}{item}</span>)}
          </div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.04em]">{data.title}</h1>
          <p className="mt-3 text-sm text-text-secondary">
            {chapters.length} units · {data.topics.length} topics · {data.material.length} files · 0 classrooms
          </p>
        </div>
      </div>

      <div role="tablist" aria-label="Subject sections" className="mb-[18px] flex gap-[3px] overflow-x-auto border-b border-border">
        {tabs.map(([value, label, count]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            type="button"
            onClick={() => setTab(value as typeof tab)}
            className={`shrink-0 border-b-2 px-[14px] py-[10px] text-sm transition ${focusRing} ${
              tab === value ? "border-border-strong font-semibold text-text-primary" : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            {label}
            {count !== undefined ? <span className="ml-1.5 text-xs opacity-65">{count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "progress" ? (
        data.topics.length ? (
          <>
            <KnowledgeGraph
              subject={data}
              source={source}
              setSource={setSource}
              selectedTopic={selectedTopic}
              setSelectedTopic={setSelectedTopic}
              encodedTitle={encodedTitle}
            />
            {weakest.length ? (
              <section className="mt-6">
                <div className="mb-[11px] flex items-baseline gap-[10px]">
                  <h2 className="font-display text-lg font-semibold">Needs work</h2>
                  <span className="text-[13px] text-text-muted">weakest {weakest.length} topic{weakest.length === 1 ? "" : "s"}</span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
                  {weakest.map((item) => (
                    <article key={item.name} className="rounded-[14px] border border-border-strong bg-bg-primary p-4 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Dot level="red" />
                        <span className="text-[13px] text-text-muted">Struggling</span>
                        <span className="flex-1" />
                        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">{item.chapter}</span>
                      </div>
                      <h3 className="mt-3 font-display text-[17px] font-semibold">{item.name}</h3>
                      <div className="mt-4 flex gap-2">
                        <Link
                          href={`/app/chat?subject=${encodedTitle}&topic=${encodeURIComponent(item.name)}&mode=practice`}
                          className={`${button} min-h-9 border-border-strong bg-text-primary px-3 text-xs text-text-inverse`}
                        >
                          Practise
                        </Link>
                        <Link
                          href={`/app/chat?subject=${encodedTitle}&topic=${encodeURIComponent(item.name)}`}
                          className={`${button} min-h-9 border-border bg-bg-primary px-3 text-xs`}
                        >
                          Ask a doubt
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <div className="rounded-[14px] border border-dashed border-border bg-bg-primary p-10 text-center text-sm text-text-muted">
            <b className="mb-1 block font-display text-[17px] text-text-primary">No topics on this subject yet</b>
            Add a chapter and the map draws itself.
          </div>
        )
      ) : null}

      {tab === "syllabus" ? (
        unitList.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {unitList.map((unit, idx) => (
              <article key={unit.name} className="rounded-[14px] border border-border bg-bg-primary p-4 shadow-sm">
                <div className="mb-2 flex items-center">
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">Unit {idx + 1}</span>
                </div>
                <h3 className="font-display text-[17px] font-semibold">{unit.name}</h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {unit.topics.map((t) => (
                    <span key={t.name} className="rounded-full border border-border bg-bg-secondary px-2.5 py-1 text-xs text-text-secondary">
                      {t.name}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-border bg-bg-primary p-10 text-center text-sm text-text-muted">
            <b className="mb-1 block font-display text-[17px] text-text-primary">No syllabus uploaded yet</b>
            Your teacher hasn&apos;t added one yet.
          </div>
        )
      ) : null}

      {tab === "material" ? (
        data.material.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
            {data.material.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setMaterial(item)}
                className={`flex min-h-[150px] flex-col rounded-[14px] border border-border bg-bg-primary p-4 text-left shadow-sm transition hover:-translate-y-px hover:border-border-strong ${focusRing}`}
              >
                <div className="flex w-full items-center">
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">{item.kind}</span>
                  <span className="flex-1" />
                  <span className="text-[13px] text-text-muted">{item.size}</span>
                </div>
                <h2 className="mt-3 font-display text-[17px] font-semibold">{item.name}</h2>
                <span className={`mt-auto w-fit rounded-full border px-2.5 py-1 text-xs ${item.state === "preparing" || item.state === "unreadable" ? "border-border-strong bg-text-primary text-text-inverse" : "border-border text-text-secondary"}`}>{item.state === "ready" ? "ready" : item.state === "preparing" ? "reading it…" : "couldn't read it"}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-border bg-bg-primary p-10 text-center text-sm text-text-muted">
            <b className="mb-1 block font-display text-[17px] text-text-primary">Nothing here yet</b>
            Your teacher hasn&apos;t added notes to this subject.
          </div>
        )
      ) : null}

      {tab === "bank" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-3">
          {bankItems.map((item) => <article key={item.name} className="flex min-h-[150px] flex-col rounded-[14px] border border-border bg-bg-primary p-4 shadow-sm"><div className="flex w-full items-center"><span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">question bank</span><span className="flex-1"/><span className="text-[13px] text-text-muted">{item.size}</span></div><h2 className="mt-3 font-display text-[17px] font-semibold">{item.name}</h2><span className="mt-auto w-fit rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">{item.found} questions found</span></article>)}
        </div>
      ) : null}

      {material ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-5" onMouseDown={(event) => event.currentTarget === event.target && setMaterial(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="material-title" className="w-full max-w-4xl max-h-[86vh] overflow-y-auto rounded-2xl border border-border bg-bg-primary p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">{material.kind}</span>
                  <span className="text-xs text-text-muted">{material.size}</span>
                </div>
                <h2 id="material-title" className="mt-2 font-display text-xl font-semibold">{material.name}</h2>
              </div>
              <span className="flex-1" />
              <button type="button" onClick={() => setMaterial(null)} className={`${button} border-border bg-bg-primary hover:bg-bg-secondary`}>Close</button>
            </div>

            <div className="my-5 rounded-xl border border-border bg-bg-secondary p-4">
              {material.state === "unreadable" ? (
                <div className="py-8 text-center text-text-muted">
                  <b className="block font-display text-base text-text-primary">This file couldn&apos;t be read</b>
                  <p className="mt-1 text-xs">It may be damaged, or in a format we don&apos;t recognise.</p>
                  <button type="button" onClick={() => setMaterial(null)} className={`${button} mt-[14px] min-h-9 border-border-strong bg-text-primary px-3 text-xs text-text-inverse`}>Try reading it again</button>
                </div>
              ) : material.kind === "Slides" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {chapters.slice(0, 4).map((ch, idx) => (
                    <div key={ch} className="aspect-[16/10] overflow-hidden rounded-lg border border-border bg-bg-primary p-4 shadow-sm">
                      <span className="font-mono-ui text-xs text-text-muted">0{idx + 1}</span>
                      <h3 className="mt-1 font-display text-base font-semibold">{ch}</h3>
                      <ul className="mt-2 list-disc pl-4 text-xs text-text-secondary space-y-1">
                        {data.topics.filter((t) => t.chapter === ch).map((t) => <li key={t.name}>{t.name}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : material.kind === "Class notes" ? (
                <div className="mx-auto max-w-xl">
                  <svg viewBox="0 0 640 380" className="w-full h-auto rounded-lg shadow-sm">
                    <rect width="640" height="380" rx="10" fill="#6b4f34" />
                    <rect x="14" y="14" width="612" height="352" rx="6" fill="#1f3d2f" />
                    <text x="44" y="70" fill="#fff" fontFamily="sans-serif" fontSize="28" fontWeight="600">{data.title}</text>
                    <line x1="44" y1="84" x2="320" y2="84" stroke="#EAF3EC" strokeWidth="2" opacity="0.55" />
                    <text x="44" y="130" fill="#EAF3EC" fontSize="20">Unit 1: Board Diagram &amp; Formulas</text>
                    <text x="44" y="170" fill="#EAF3EC" fontSize="16" opacity="0.8">τ = NIAB sin θ</text>
                    <text x="44" y="210" fill="#EAF3EC" fontSize="16" opacity="0.8">e = -N (dΦ/dt)</text>
                    <text x="580" y="340" textAnchor="end" fill="#EAF3EC" fontSize="12" opacity="0.5">{material.name}</text>
                  </svg>
                </div>
              ) : (
                <div className="mx-auto max-w-2xl rounded-lg border border-border bg-bg-primary p-6 shadow-sm">
                  <h3 className="font-display text-lg font-semibold">{material.name.replace(/\.[a-z0-9]+$/i, "")}</h3>
                  <p className="mt-1 text-xs text-text-muted">{data.title} {data.code ? `· ${data.code}` : ""}</p>
                  <hr className="my-4 border-border" />
                  {chapters.map((ch, idx) => (
                    <div key={ch} className="mb-4">
                      <h4 className="font-display text-sm font-semibold">{idx + 1}. {ch}</h4>
                      <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                        {data.topics.filter((t) => t.chapter === ch).map((t) => t.name).join(", ") || "Notes for this unit"}. Worked examples and exam-style questions for {data.title}.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Link href={`/app/chat?subject=${encodedTitle}&material=${encodeURIComponent(material.name)}`} className={`${button} border-border-strong bg-text-primary text-text-inverse`}>
                Ask about this
              </Link>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
