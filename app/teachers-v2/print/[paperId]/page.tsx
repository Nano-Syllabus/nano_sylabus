import { notFound, redirect } from "next/navigation";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrintActions } from "./print-actions";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" ? value as RecordValue : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : Number(value) || 0;
}

function values(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

export default async function PrintableTeacherPaper({ params }: { params: Promise<{ paperId: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { paperId } = await params;
  if (!user) redirect(`/login?next=${encodeURIComponent(`/teachers/print/${paperId}`)}`);
  const teacher = await getTeacherProfile();
  if (!teacher) redirect("/teachers");

  const admin = createSupabaseAdminClient();
  const [{ data: row, error }, { data: profile }] = await Promise.all([
    admin.from("teacher_exam_papers").select("paper,total_marks,pass_marks,created_at").eq("teacher_id", teacher.id).eq("external_paper_id", paperId).is("archived_at", null).maybeSingle(),
    admin.from("student_profiles").select("full_name,college").eq("user_id", user.id).maybeSingle(),
  ]);
  if (error || !row) notFound();

  const paper = record(row.paper);
  const questions = values(paper.questions);
  const title = text(paper.title) || "Examination paper";
  const subject = text(paper.subject) || text(paper.subject_name) || "Subject";
  const totalMarks = numberValue(paper.totalMarks || paper.total_marks || row.total_marks);
  const passMarks = numberValue(paper.passMarks || paper.pass_marks || row.pass_marks);
  const timeLimitMinutes = Math.max(5, numberValue(paper.timeLimitMinutes) || 60);
  const teacherName = profile?.full_name || (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : teacher.handle);
  const institution = profile?.college || "NanoSyllabus";

  return (
    <main className="min-h-screen bg-bg-secondary px-4 py-6 text-text-primary print:bg-white print:p-0 print:text-black">
      <PrintActions paperId={paperId} />
      {/* Physical/printed paper intentionally uses black ink on a white sheet in every app theme. */}
      <article className="mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white px-[16mm] py-[14mm] text-black shadow-lg print:min-h-0 print:max-w-none print:shadow-none">
        <header className="border-b-2 border-black pb-5 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em]">{institution}</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm">{subject}</p>
          <div className="mt-5 grid grid-cols-2 gap-4 text-left text-sm sm:grid-cols-5">
            <p><span className="font-semibold">Teacher:</span><br />{teacherName}</p>
            <p><span className="font-semibold">Full marks:</span><br />{totalMarks}</p>
            <p><span className="font-semibold">Pass marks:</span><br />{passMarks}</p>
            <p><span className="font-semibold">Time:</span><br />{timeLimitMinutes} minutes</p>
            <p><span className="font-semibold">Date:</span><br />____________</p>
          </div>
        </header>

        <section className="mt-6 rounded-md border border-black p-4 text-sm leading-6">
          <h2 className="font-semibold">Instructions</h2>
          <ul className="mt-1 list-disc pl-5">
            <li>Attempt every question unless your teacher says otherwise.</li>
            <li>Show the necessary working for numerical questions.</li>
            <li>Write the question number clearly with each answer.</li>
          </ul>
        </section>

        <ol className="mt-8 space-y-7">
          {questions.map((question, index) => {
            const options = Array.isArray(question.options) ? question.options.filter((option): option is string => typeof option === "string") : [];
            const marks = numberValue(question.marks);
            return (
              <li key={text(question.id) || String(index)} className="break-inside-avoid">
                <div className="flex items-start gap-4">
                  <span className="font-semibold">{index + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-4">
                      <p className="min-w-0 flex-1 whitespace-pre-wrap leading-7">{text(question.text) || text(question.prompt) || "Question"}</p>
                      <span className="shrink-0 text-sm font-semibold">[{marks}]</span>
                    </div>
                    {options.length ? <ol className="mt-3 grid gap-2 pl-1 text-sm sm:grid-cols-2">{options.map((option, optionIndex) => <li key={`${index}-${optionIndex}`}>{String.fromCharCode(97 + optionIndex)}) {option}</li>)}</ol> : null}
                    {!options.length ? <div className="mt-5 space-y-4" aria-hidden="true">{Array.from({ length: marks >= 6 ? 5 : marks >= 3 ? 3 : 2 }).map((_, line) => <div key={line} className="border-b border-dotted border-gray-400" />)}</div> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <footer className="mt-12 flex items-center justify-between border-t border-black pt-4 text-xs">
          <span>Generated securely from the teacher&apos;s indexed material.</span>
          <span>Total: {totalMarks} marks</span>
        </footer>
      </article>
    </main>
  );
}
