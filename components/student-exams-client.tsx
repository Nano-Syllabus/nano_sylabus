"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  EXAM_TOPIC_LEVELS,
  PUBLISHED_EXAM,
  STUDENT_EXAMS,
  findStudentExam,
  type StudentExam,
  type StudentExamQuestion,
} from "@/lib/nano-student-exams";
import { NANO_OWN_STUDY, NANO_STUDENT_SUBJECTS, type KnowledgeLevel, type NanoStudentSubject } from "@/lib/nano-student-subjects";
import { cn } from "@/lib/utils";

type Answer = { choice?: number; text?: string; photoName?: string };
type ResultLine = { question: StudentExamQuestion; got: number; note: string; answer: string };
type Result = { exam: StudentExam; score: number; outOf: number; lines: ResultLine[] };
type PracticeLength = 5 | 10;
type PracticeStyle = "mixed" | "past";

const shellButton = "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2";
const primaryButton = `${shellButton} bg-text-primary text-text-inverse hover:opacity-85`;
const secondaryButton = `${shellButton} border border-border-strong hover:bg-bg-secondary`;

function Chip({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return <span className={cn("inline-flex min-h-8 items-center rounded-full border px-3 text-[13px]", strong ? "border-border-strong" : "border-border text-text-secondary")}>{children}</span>;
}

function levelMeta(topic: string) {
  const level = EXAM_TOPIC_LEVELS[topic] || "grey";
  if (level === "red") return { label: "Struggling", color: "bg-destructive", border: "border-border-strong" };
  if (level === "yellow") return { label: "Getting there", color: "bg-warning", border: "border-border" };
  if (level === "green") return { label: "Solid", color: "bg-success", border: "border-border" };
  return { label: "Not started", color: "bg-text-muted", border: "border-border" };
}

function askHref(topic: string) {
  const query = new URLSearchParams({ subject: "Engineering Physics I", prompt: `I have a doubt about ${topic}. Please help me understand it.` });
  return `/app/chat?${query.toString()}`;
}

function Dialog({ title, children, footer, onClose }: { title: string; children: React.ReactNode; footer: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="exam-dialog-title" className="relative w-full max-w-lg rounded-2xl border border-border bg-bg-primary p-6 shadow-xl">
        <h2 id="exam-dialog-title" className="font-display text-2xl font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
      </section>
    </div>
  );
}

const knowledgeRank: Record<KnowledgeLevel, number> = { red: 0.2, grey: 0.5, yellow: 0.55, green: 0.9 };
const practiceSubjects = [...NANO_STUDENT_SUBJECTS, NANO_OWN_STUDY];

function weakestTopics(subject: NanoStudentSubject) {
  return [...subject.topics]
    .sort((left, right) => knowledgeRank[left.level] - knowledgeRank[right.level])
    .slice(0, 3)
    .map((topic) => topic.name);
}

function PracticeDialog({
  subject,
  selectedTopics,
  length,
  style,
  onSubject,
  onTopic,
  onLength,
  onStyle,
  onClose,
  onStart,
}: {
  subject: NanoStudentSubject;
  selectedTopics: string[];
  length: PracticeLength;
  style: PracticeStyle;
  onSubject: (subject: NanoStudentSubject) => void;
  onTopic: (topic: string) => void;
  onLength: (length: PracticeLength) => void;
  onStyle: (style: PracticeStyle) => void;
  onClose: () => void;
  onStart: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-5">
      <button type="button" aria-label="Close practice dialog" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="practice-dialog-title" className="relative max-h-[86vh] w-full max-w-[580px] overflow-y-auto rounded-2xl border border-border bg-bg-primary shadow-xl">
        <header className="flex items-center gap-3 border-b border-border px-[22px] py-[18px]">
          <h2 id="practice-dialog-title" className="font-display text-xl font-semibold">Practise</h2>
          <span className="flex-1" />
          <button ref={closeButton} type="button" className={secondaryButton} onClick={onClose}>Close</button>
        </header>

        <div className="px-[22px] py-5">
          <div className="mb-[14px] flex gap-[7px] overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {practiceSubjects.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => onSubject(item)}
                className={cn(
                  "min-h-10 shrink-0 whitespace-nowrap rounded-full border px-[14px] text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                  item.slug === subject.slug ? "border-border-strong bg-text-primary font-medium text-text-inverse" : "border-border bg-bg-primary text-text-secondary hover:border-border-strong",
                )}
              >
                {item.title}
              </button>
            ))}
          </div>

          <fieldset>
            <legend className="mb-2 text-[13px] text-text-muted">Which chapters? Your weakest are already ticked.</legend>
            {subject.topics.length ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {subject.topics.map((topic) => {
                  const selected = selectedTopics.includes(topic.name);
                  return (
                    <button
                      key={topic.name}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onTopic(topic.name)}
                      className={cn(
                        "min-h-10 rounded-full border px-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                        selected ? "border-border-strong bg-text-primary text-text-inverse" : "border-border bg-bg-primary text-text-secondary hover:border-border-strong",
                      )}
                    >
                      {selected ? "✓ " : ""}{topic.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mb-4 text-[13px] text-text-muted">This subject has no chapters yet — the whole syllabus will be used.</p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-[13px] text-text-muted">How long?</legend>
            <div className="mb-4 inline-flex max-w-full rounded-xl border border-border bg-bg-primary p-1 shadow-sm">
              <button type="button" onClick={() => onLength(5)} className={cn("min-h-10 rounded-[9px] px-[18px] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong", length === 5 ? "bg-text-primary font-semibold text-text-inverse" : "text-text-secondary")}>Quick · 5 questions</button>
              <button type="button" onClick={() => onLength(10)} className={cn("min-h-10 rounded-[9px] px-[18px] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong", length === 10 ? "bg-text-primary font-semibold text-text-inverse" : "text-text-secondary")}>Full · 10 questions</button>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-[13px] text-text-muted">What sort?</legend>
            <div className="mb-1.5 inline-flex max-w-full rounded-xl border border-border bg-bg-primary p-1 shadow-sm">
              <button type="button" onClick={() => onStyle("mixed")} className={cn("min-h-10 rounded-[9px] px-[18px] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong", style === "mixed" ? "bg-text-primary font-semibold text-text-inverse" : "text-text-secondary")}>Mixed</button>
              <button type="button" onClick={() => onStyle("past")} className={cn("min-h-10 rounded-[9px] px-[18px] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong", style === "past" ? "bg-text-primary font-semibold text-text-inverse" : "text-text-secondary")}>Past paper style</button>
            </div>
            <p className="text-[13px] text-text-muted">{style === "past" ? "Questions written the way they came in old question papers, with the year marked." : "A few multiple choice to warm up, then written answers."}</p>
          </fieldset>
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-bg-primary px-[22px] py-[15px]">
          <button type="button" className={secondaryButton} onClick={onClose}>Cancel</button>
          <button type="button" className={primaryButton} disabled={subject.topics.length > 0 && selectedTopics.length === 0} onClick={onStart}>Start practising</button>
        </footer>
      </section>
    </div>
  );
}

export function StudentExamsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const examId = searchParams.get("exam");
  const mode = searchParams.get("mode");
  const selectedExam = findStudentExam(examId);
  const [listTab, setListTab] = useState<"todo" | "done">("todo");
  const [dialog, setDialog] = useState<"join" | "practice" | "writing" | "submit" | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [attemptExam, setAttemptExam] = useState<StudentExam | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [resultTab, setResultTab] = useState<"answers" | "summary">("answers");
  const [practiceSubject, setPracticeSubject] = useState<NanoStudentSubject>(NANO_STUDENT_SUBJECTS[0]);
  const [practiceTopics, setPracticeTopics] = useState<string[]>(() => weakestTopics(NANO_STUDENT_SUBJECTS[0]));
  const [practiceLength, setPracticeLength] = useState<PracticeLength>(5);
  const [practiceStyle, setPracticeStyle] = useState<PracticeStyle>("mixed");
  const joinInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dialog === "join") joinInput.current?.focus();
  }, [dialog]);

  useEffect(() => {
    if (!attemptExam || mode !== "sit") return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [attemptExam, mode]);

  useEffect(() => {
    if (!selectedExam || mode !== "marking") return;
    const timer = window.setTimeout(() => {
      router.replace(`/app/exams?exam=${selectedExam.id}&mode=result`, { scroll: false });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [mode, router, selectedExam]);

  const answeredCount = useMemo(() => Object.values(answers).filter((answer) => answer.choice !== undefined || answer.text?.trim() || answer.photoName).length, [answers]);
  const todoExams = useMemo(
    () => STUDENT_EXAMS.filter((exam) => exam.id === "x_mid" || exam.id === "x_mock"),
    [],
  );

  useEffect(() => {
    if (!selectedExam || !mode) return;
    if ((mode === "sit" || mode === "marking") && attemptExam?.id !== selectedExam.id) {
      setAttemptExam(selectedExam);
      setQuestionIndex(0);
      setAnswers({});
      setSecondsLeft(selectedExam.minutes * 60);
    }
    if (mode === "result" && !result) {
      const lines = selectedExam.questions.map((question) => ({
        question,
        got: Math.ceil(question.marks * 0.7),
        note: "The right idea, one step missing.",
        answer: "A saved student answer.",
      }));
      setResult({
        exam: selectedExam,
        score: lines.reduce((total, line) => total + line.got, 0),
        outOf: lines.reduce((total, line) => total + line.question.marks, 0),
        lines,
      });
    }
  }, [attemptExam?.id, mode, result, selectedExam]);

  function showExam(exam: StudentExam) {
    router.push(`/app/exams?exam=${exam.id}`, { scroll: false });
  }

  function startExam(exam: StudentExam) {
    setAttemptExam(exam);
    setQuestionIndex(0);
    setAnswers({});
    setSecondsLeft(exam.minutes * 60);
    router.push(`/app/exams?exam=${exam.id}&mode=sit`, { scroll: false });
  }

  function markExam() {
    if (!attemptExam) return;
    const lines = attemptExam.questions.map((question) => {
      const answer = answers[question.id];
      let got = 0;
      let note = "Nothing written, so no marks.";
      if (answer) {
        if (question.type === "choice") {
          got = answer.choice === question.answer ? question.marks : 0;
          note = got ? "Correct." : "Not right. Go back over the definition.";
        } else if (answer.photoName && !answer.text?.trim()) {
          got = Math.round(question.marks * 0.7);
          note = "Your handwriting came through fine. The method is sound; the last line is missing.";
        } else {
          const length = answer.text?.trim().length || 0;
          const ratio = length > 260 ? 0.85 : length > 120 ? 0.65 : length > 30 ? 0.4 : 0.15;
          got = Math.round(question.marks * ratio);
          note = ratio > 0.8 ? "A complete answer." : ratio > 0.6 ? "The right idea, one step missing." : ratio > 0.3 ? "Too brief. State the law first." : "Barely started.";
        }
      }
      return { question, got, note, answer: answer?.text || (answer?.choice !== undefined && question.options ? question.options[answer.choice] : answer?.photoName ? `Photo: ${answer.photoName}` : "") };
    });
    const outOf = lines.reduce((total, line) => total + line.question.marks, 0);
    const score = lines.reduce((total, line) => total + line.got, 0);
    setResult({ exam: attemptExam, score, outOf, lines });
    setDialog(null);
    router.push(`/app/exams?exam=${attemptExam.id}&mode=marking`, { scroll: false });
    window.setTimeout(() => router.replace(`/app/exams?exam=${attemptExam.id}&mode=result`, { scroll: false }), 2200);
  }

  function choosePracticeSubject(subject: NanoStudentSubject) {
    setPracticeSubject(subject);
    setPracticeTopics(weakestTopics(subject));
  }

  function togglePracticeTopic(topic: string) {
    setPracticeTopics((current) => current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]);
  }

  function buildPracticeExam() {
    const pool = (practiceTopics.length ? practiceSubject.topics.filter((topic) => practiceTopics.includes(topic.name)) : practiceSubject.topics).slice(0, 6);
    if (!pool.length) return;
    const mixedOrder = ["choice", "choice", "short", "long", "short"] as const;
    const pastOrder = ["long", "short", "long", "short", "long"] as const;
    const order = practiceStyle === "past" ? pastOrder : mixedOrder;
    const questions: StudentExamQuestion[] = Array.from({ length: practiceLength }, (_, index) => {
      const topic = pool[index % pool.length];
      const type = order[index % order.length];
      const year = practiceStyle === "past" ? `[${2076 + (index % 6)}, Q${1 + (index % 8)}] ` : "";
      if (type === "choice") {
        return {
          id: `practice-${Date.now()}-${index}`,
          type,
          marks: 2,
          topic: topic.name,
          prompt: `${year}Which of these is true of ${topic.name.toLowerCase()}?`,
          options: ["It only holds for closed loops", "It follows from conservation of energy", "It depends on where the observer stands", "It only holds at low speeds"],
          answer: 1,
        };
      }
      if (type === "short") {
        return { id: `practice-${Date.now()}-${index}`, type, marks: 3, topic: topic.name, prompt: `${year}State ${topic.name.toLowerCase()} and give one condition under which it fails.` };
      }
      return {
        id: `practice-${Date.now()}-${index}`,
        type,
        marks: 6,
        topic: topic.name,
        prompt: `${year}Explain ${topic.name.toLowerCase()}, then work through one numerical example.`,
        marking: [{ label: "Clear statement", marks: 2 }, { label: "Worked example", marks: 3 }, { label: "Correct units", marks: 1 }],
      };
    });
    const exam: StudentExam = {
      id: `x_practice_${Date.now()}`,
      subject: practiceSubject.title,
      title: `${pool.length === 1 ? pool[0].name : practiceSubject.title} practice`,
      kind: "practice",
      counts: false,
      marks: questions.reduce((total, question) => total + question.marks, 0),
      minutes: practiceLength === 5 ? 15 : 30,
      attempts: null,
      window: "practice",
      windowLabel: "Whenever you like",
      questions,
    };
    setDialog("writing");
    window.setTimeout(() => {
      setDialog(null);
      startExam(exam);
    }, 1100);
  }

  if (mode === "marking" && attemptExam) return <MarkingView exam={attemptExam} />;
  if (mode === "result" && result) return <ResultView result={result} tab={resultTab} onTab={setResultTab} />;
  if (mode === "sit" && attemptExam) {
    const question = attemptExam.questions[questionIndex];
    return (
      <AttemptView
        exam={attemptExam}
        question={question}
        questionIndex={questionIndex}
        answers={answers}
        answeredCount={answeredCount}
        secondsLeft={secondsLeft}
        onAnswer={(answer) => setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], ...answer } }))}
        onQuestion={setQuestionIndex}
        onSubmit={() => setDialog("submit")}
      >
        {dialog === "submit" ? (
          <Dialog title="Hand it in" onClose={() => setDialog(null)} footer={<><button type="button" className={secondaryButton} onClick={() => setDialog(null)}>Keep working</button><button type="button" className={primaryButton} onClick={markExam}>Hand it in</button></>}>
            <p>{attemptExam.questions.length - answeredCount ? <><b>{attemptExam.questions.length - answeredCount} questions are still blank.</b> Blank answers get no marks.</> : "Every question has an answer."}</p>
            <div className="mt-4 rounded-xl border border-border bg-bg-secondary p-4 text-sm">Marking usually takes under a minute. {attemptExam.counts ? "Your teacher sees the result too." : "This is practice, so it stays with you."}</div>
          </Dialog>
        ) : null}
      </AttemptView>
    );
  }

  if (selectedExam) return <ExamOverview exam={selectedExam} onStart={startExam} />;

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!joinCode.trim()) {
      setJoinError("Type the code you were given.");
      return;
    }
    setJoinError("Nothing has that code. Check it and try again.");
  }

  return (
    <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-sm font-medium text-text-secondary">Exams</p>
          <h1 className="mt-3 font-display text-[28px] font-semibold tracking-[-0.04em]">Exams</h1>
        </div>
        <span className="flex-1" />
        <button type="button" className={secondaryButton} onClick={() => setDialog("join")}>Join with a code</button>
        <button type="button" className={primaryButton} onClick={() => setDialog("practice")}>Practise</button>
      </div>

      <div role="tablist" aria-label="Exam lists" className="mt-6 inline-flex rounded-xl border border-border p-1">
        {([['todo', 'To do', 2], ['done', 'Done', 2]] as const).map(([value, label, count]) => (
          <button key={value} type="button" role="tab" aria-selected={listTab === value} className={cn("min-h-10 rounded-lg px-5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong", listTab === value ? "bg-text-primary text-text-inverse" : "text-text-secondary hover:bg-bg-secondary")} onClick={() => setListTab(value)}>{label} <span className="ml-1 opacity-70">{count}</span></button>
        ))}
      </div>

      {listTab === "todo" ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {todoExams.map((exam) => <ExamListCard key={exam.id} exam={exam} onOpen={() => showExam(exam)} onStart={() => startExam(exam)} />)}
        </div>
      ) : (
        <>
          <section className="mt-4 rounded-[14px] border border-border p-5">
            <h2 className="font-display text-lg font-semibold">2 results are not published yet.</h2>
            <p className="mt-2 text-sm text-text-muted">Your teacher checks the papers first. You will see the marks the moment they publish.</p>
          </section>
          <div className="mt-4 flex flex-wrap gap-3">
            <UnpublishedExamCard title="Quick quiz: induction" marks="10 marks · 20 minutes" />
            <UnpublishedExamCard title={PUBLISHED_EXAM.title} marks={`${PUBLISHED_EXAM.marks} marks`} />
          </div>
        </>
      )}

      {dialog === "join" ? (
        <Dialog title="Join with a code" onClose={() => setDialog(null)} footer={<><button type="button" className={secondaryButton} onClick={() => setDialog("practice")}>Browse courses</button><button type="submit" form="join-exam-form" className={primaryButton}>Go</button></>}>
          <form id="join-exam-form" onSubmit={submitJoin}>
            <label htmlFor="exam-code" className="text-sm font-medium">Type the code you were given</label>
            <input ref={joinInput} id="exam-code" type="text" autoComplete="one-time-code" spellCheck={false} value={joinCode} onChange={(event) => { setJoinCode(event.target.value.toUpperCase()); setJoinError(""); }} placeholder="BEI-4K2M" aria-invalid={joinError ? "true" : undefined} aria-describedby={joinError ? "exam-code-error" : undefined} className="mt-2 h-12 w-full rounded-lg border border-border bg-bg-primary px-3 font-mono text-lg uppercase tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong" />
            {joinError ? <p id="exam-code-error" className="mt-2 text-sm text-destructive">{joinError}</p> : null}
            <div className="mt-4 rounded-xl border border-border bg-bg-secondary p-4 text-sm">Your class code brings in every subject at once. A single subject or a single exam may have its own code.</div>
          </form>
        </Dialog>
      ) : null}

      {dialog === "practice" ? (
        <PracticeDialog
          subject={practiceSubject}
          selectedTopics={practiceTopics}
          length={practiceLength}
          style={practiceStyle}
          onSubject={choosePracticeSubject}
          onTopic={togglePracticeTopic}
          onLength={setPracticeLength}
          onStyle={setPracticeStyle}
          onClose={() => setDialog(null)}
          onStart={buildPracticeExam}
        />
      ) : null}

      {dialog === "writing" ? (
        <Dialog title="Writing your questions" onClose={() => setDialog(null)} footer={null}>
          <b>{practiceLength} questions from {practiceTopics.length} chapter{practiceTopics.length === 1 ? "" : "s"}</b>
          <p className="mt-1 text-[13px] text-text-muted">Taken from your notes and the past papers on this subject.</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-secondary"><div className="h-full w-[70%] animate-pulse rounded-full bg-text-primary motion-reduce:animate-none" /></div>
        </Dialog>
      ) : null}
    </div>
  );
}

function ExamListCard({ exam, onOpen, onStart }: { exam: StudentExam; onOpen: () => void; onStart: () => void }) {
  const active = exam.window === "open" || exam.window === "practice";
  return (
    <article className={cn("w-full rounded-[14px] border px-4 py-4 sm:max-w-[395px] sm:basis-[395px] sm:flex-none", active ? "border-border-strong" : "border-border")}>
      <div className="flex items-center justify-between gap-2"><Chip>{exam.subject}</Chip><Chip strong={exam.counts}>{exam.counts ? "counts" : "practice"}</Chip></div>
      <h2 className="mt-3 font-display text-lg font-semibold">{exam.title}</h2>
      <p className="mt-1 text-sm text-text-secondary">{exam.marks} marks · {exam.minutes} minutes</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {active ? <button type="button" className={primaryButton} onClick={onStart}>Start</button> : null}
        <Chip>{exam.windowLabel}</Chip>
        <span className="flex-1" />
        <button type="button" className={secondaryButton} onClick={onOpen}>What it covers</button>
      </div>
    </article>
  );
}

function UnpublishedExamCard({ title, marks }: { title: string; marks: string }) {
  return (
    <article className="w-full rounded-[14px] border border-border px-4 py-4 sm:max-w-[395px] sm:basis-[395px] sm:flex-none">
      <div className="flex items-center justify-between gap-2">
        <Chip>Engineering Physics I</Chip>
        <Chip strong>counts</Chip>
      </div>
      <h2 className="mt-3 font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-text-muted">{marks}</p>
      <div className="mt-5">
        <span className="inline-flex min-h-9 items-center rounded-full bg-text-primary px-3 text-[13px] text-text-inverse">
          result not published yet
        </span>
      </div>
    </article>
  );
}

function ExamOverview({ exam, onStart }: { exam: StudentExam; onStart: (exam: StudentExam) => void }) {
  const topics = [...new Set(exam.questions.map((question) => question.topic))];
  const weakCount = topics.filter((topic) => EXAM_TOPIC_LEVELS[topic] !== "green").length;
  return (
    <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
      <nav className="text-sm text-text-muted"><Link href="/app/exams" className="hover:text-text-primary">Exams</Link> / <b className="text-text-secondary">{exam.title}</b></nav>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2"><Chip>{exam.subject}</Chip><Chip strong={exam.counts}>{exam.counts ? "counts towards your record" : "practice only"}</Chip></div>
          <h1 className="mt-4 font-display text-[28px] font-semibold tracking-[-0.04em]">{exam.title}</h1>
          <p className="mt-3 text-[15px] text-text-secondary">{exam.questions.length} questions · {exam.marks} marks · {exam.minutes ? `${exam.minutes} minutes once you start` : "no time limit"}</p>
        </div>
        <span className="flex-1" />
        {exam.window === "open" || exam.window === "practice" ? <button type="button" className={primaryButton} onClick={() => onStart(exam)}>Start</button> : <Chip>{exam.windowLabel}</Chip>}
      </div>
      <section className="mt-9">
        <div className="flex items-baseline gap-3"><h2 className="font-display text-xl font-semibold">What it covers</h2><span className="text-sm text-text-muted">{weakCount} not solid yet</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {topics.map((topic) => {
            const meta = levelMeta(topic);
            return <article key={topic} className={cn("rounded-[14px] border px-4 py-4", meta.border)}><p className="flex items-center gap-2 text-sm text-text-muted"><span className={cn("h-2 w-2 rounded-full", meta.color)} />{meta.label}</p><h3 className="mt-3 font-display text-lg font-semibold">{topic}</h3><div className="mt-5 flex gap-2"><Link href="/app/exams?exam=x_mock&mode=sit" className={primaryButton}>Practise</Link><Link href={askHref(topic)} className={secondaryButton}>Ask a doubt</Link></div></article>;
          })}
        </div>
      </section>
    </div>
  );
}

function AttemptView({ exam, question, questionIndex, answers, answeredCount, secondsLeft, onAnswer, onQuestion, onSubmit, children }: { exam: StudentExam; question: StudentExamQuestion; questionIndex: number; answers: Record<string, Answer>; answeredCount: number; secondsLeft: number; onAnswer: (answer: Answer) => void; onQuestion: (index: number) => void; onSubmit: () => void; children: React.ReactNode }) {
  const answer = answers[question.id] || {};
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  return <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
    <nav className="text-sm text-text-muted"><Link href={`/app/exams?exam=${exam.id}`}>{exam.title}</Link> / <b className="text-text-secondary">In progress</b></nav>
    <div className="mt-5 flex flex-wrap items-start gap-4"><div><h1 className="font-display text-[28px] font-semibold">{exam.title}</h1><p className="mt-2 text-sm text-text-secondary">{exam.questions.length} questions, {exam.marks} marks. Your answers save as you go.</p></div><span className="flex-1" /><div className="min-w-36 rounded-[14px] border border-border p-4 text-right"><p className="text-xs text-text-muted">Time left</p><p className="mt-1 font-mono text-2xl font-medium">{minutes}:{seconds}</p><p className="mt-1 text-xs text-text-muted">{answeredCount} of {exam.questions.length} answered</p></div></div>
    <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_240px]">
      <section className="rounded-[14px] border border-border p-5"><div className="flex flex-wrap gap-2"><Chip strong>Question {questionIndex + 1} of {exam.questions.length}</Chip><Chip>{question.marks} {question.marks === 1 ? "mark" : "marks"}</Chip></div><p className="mt-4 text-base leading-7">{question.prompt}</p>
        {question.type === "choice" ? <fieldset className="mt-4 space-y-2"><legend className="sr-only">Choose one answer</legend>{question.options?.map((option, index) => <label key={option} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm transition", answer.choice === index ? "border-border-strong bg-bg-secondary" : "border-border hover:border-border-strong")}><input type="radio" name={question.id} checked={answer.choice === index} onChange={() => onAnswer({ choice: index })} /><span className="grid h-7 w-7 place-items-center rounded-full border border-border text-xs">{String.fromCharCode(97 + index)}</span>{option}</label>)}</fieldset> : <div className="mt-4"><label htmlFor={`answer-${question.id}`} className="sr-only">Your answer</label><textarea id={`answer-${question.id}`} value={answer.text || ""} onChange={(event) => onAnswer({ text: event.target.value })} placeholder="Write your answer, or take a photo of what you did on paper." className="min-h-44 w-full resize-y rounded-xl border border-border bg-bg-primary p-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong" /><div className="mt-3 flex flex-wrap items-center gap-2"><label className={secondaryButton}>Add a photo of my working<input type="file" accept="image/*" className="sr-only" onChange={(event) => onAnswer({ photoName: event.target.files?.[0]?.name || "" })} /></label>{answer.photoName ? <><span className="text-sm text-text-secondary">{answer.photoName}</span><button type="button" className={secondaryButton} onClick={() => onAnswer({ photoName: "" })}>Remove</button></> : null}<span className="ml-auto text-xs text-text-muted">{answer.text || answer.photoName ? "Saved" : "Nothing saved yet"}</span></div></div>}
        {question.marking ? <div className="mt-4 text-sm text-text-muted">Marks are given for: <div className="mt-2 flex flex-wrap gap-2">{question.marking.map((item) => <Chip key={item.label}>{item.label} · {item.marks}</Chip>)}</div></div> : null}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} disabled={questionIndex === 0} onClick={() => onQuestion(questionIndex - 1)}>Back</button><button type="button" className={secondaryButton} disabled={questionIndex === exam.questions.length - 1} onClick={() => onQuestion(questionIndex + 1)}>Next</button><span className="flex-1" /><button type="button" className={primaryButton} onClick={onSubmit}>Hand it in</button></div>
      </section>
      <aside className="rounded-[14px] border border-border p-4"><p className="text-sm text-text-muted">Questions</p><div className="mt-3 grid grid-cols-5 gap-2">{exam.questions.map((item, index) => <button key={item.id} type="button" aria-label={`Go to question ${index + 1}`} className={cn("h-10 rounded-lg border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong", index === questionIndex ? "border-text-primary bg-text-primary text-text-inverse" : answers[item.id] ? "border-border-strong bg-bg-secondary" : "border-border")} onClick={() => onQuestion(index)}>{index + 1}</button>)}</div><p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-text-muted">Filled squares are answered. Nothing goes to your teacher until you hand it in.</p></aside>
    </div>{children}
  </div>;
}

function MarkingView({ exam }: { exam: StudentExam }) {
  return <div className="w-full max-w-[900px] px-4 pb-10 pt-10 sm:px-6"><h1 className="font-display text-[28px] font-semibold">Marking your paper</h1><p className="mt-2 text-text-secondary">Reading your answers against what each question was looking for.</p><div className="mt-6 rounded-[14px] border border-border p-5"><div className="h-2 overflow-hidden rounded-full bg-bg-secondary"><div className="h-full w-3/4 animate-pulse rounded-full bg-text-primary motion-reduce:animate-none" /></div><p className="mt-3 text-sm text-text-muted">Checking each answer against the marking points…</p></div></div>;
}

function ResultView({ result, tab, onTab }: { result: Result; tab: "answers" | "summary"; onTab: (tab: "answers" | "summary") => void }) {
  const percent = Math.round((result.score / Math.max(1, result.outOf)) * 100);
  return <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6"><nav className="text-sm text-text-muted"><Link href="/app/exams">Exams</Link> / <b className="text-text-secondary">{result.exam.title}</b></nav><div className="mt-5 flex flex-wrap items-end gap-4"><div><div className="flex flex-wrap gap-2"><Chip strong={result.exam.counts}>{result.exam.counts ? "counts towards the record" : "practice only"}</Chip><Chip>published</Chip></div><h1 className="mt-4 font-display text-[28px] font-semibold">{result.exam.title}</h1><p className="mt-2 text-sm text-text-secondary">{result.exam.subject} · handed in just now</p></div><span className="flex-1" /><div className="font-display text-5xl font-semibold">{result.score}<small className="ml-1 text-base text-text-muted">of {result.outOf}</small></div></div>
    <div role="tablist" className="mt-7 flex border-b border-border"><button type="button" role="tab" aria-selected={tab === "answers"} className={cn("min-h-11 border-b-2 px-4 text-sm font-medium", tab === "answers" ? "border-text-primary" : "border-transparent text-text-muted")} onClick={() => onTab("answers")}>Answers &amp; Feedback</button><button type="button" role="tab" aria-selected={tab === "summary"} className={cn("min-h-11 border-b-2 px-4 text-sm font-medium", tab === "summary" ? "border-text-primary" : "border-transparent text-text-muted")} onClick={() => onTab("summary")}>Summary</button></div>
    {tab === "answers" ? <div className="mt-4 space-y-3">{result.lines.map((line, index) => <article key={line.question.id} className="overflow-hidden rounded-[14px] border border-border"><div className="flex flex-wrap items-center gap-2 border-b border-border p-4"><Chip>Question {index + 1}</Chip><Chip strong={line.got === line.question.marks}>{line.got} / {line.question.marks} marks</Chip><p className="basis-full pt-1 text-sm font-medium">{line.question.prompt}</p></div><div className="grid md:grid-cols-2"><div className="p-4 md:border-r md:border-border"><p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">Student answer</p><p className="mt-2 whitespace-pre-wrap text-sm">{line.answer || <span className="text-text-muted">No answer given</span>}</p></div><div className="border-t border-border p-4 md:border-t-0"><p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">Feedback</p><p className="mt-2 text-sm">{line.note}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-secondary"><div className="h-full bg-text-primary" style={{ width: `${Math.round(line.got / Math.max(1, line.question.marks) * 100)}%` }} /></div></div></div></article>)}</div> : <div className="mt-4 grid gap-3 md:grid-cols-2"><article className="rounded-[14px] border border-border p-5"><h2 className="font-display text-lg font-semibold">What the marker said</h2><p className="mt-4 text-sm leading-6">{percent > 75 ? "A strong paper. Your method holds up." : percent > 50 ? "You know the material. Precision is costing you marks." : "The ideas are there in outline. Write the law down before the working."}</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-sm text-text-muted">Went well</p><p className="mt-2 text-sm">✓ You attempted every section</p></div><div><p className="text-sm text-text-muted">Cost marks</p><p className="mt-2 text-sm">→ State the law before the working</p></div></div></article><article className="rounded-[14px] border border-border p-5"><h2 className="font-display text-lg font-semibold">The number</h2><p className="mt-5 text-sm text-text-muted">Percentage</p><p className="font-display text-4xl font-semibold">{percent}%</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-secondary"><div className="h-full bg-text-primary" style={{ width: `${percent}%` }} /></div></article></div>}
  </div>;
}
