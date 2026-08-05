import { headers } from "next/headers";
import { QRCodeSVG } from "qrcode.react";
import { PrintInviteButton } from "./print-button";

export default async function ClassroomInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ classroom?: string; subject?: string }>;
}) {
  const [{ code }, query, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const joinCode = decodeURIComponent(code).replace(/[^A-Za-z0-9]/g, "").slice(0, 32).toUpperCase();
  const inviteUrl = `${protocol}://${host}/app/exams?join=${encodeURIComponent(joinCode)}`;

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black print:p-0">
      <div className="mx-auto max-w-2xl rounded-2xl border border-black/15 p-8 text-center shadow-sm print:border-0 print:shadow-none sm:p-12">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-black/50">NanoSyllabus · Teacher portal</p>
        <h1 className="mt-5 font-display text-4xl font-semibold">Join our classroom</h1>
        <p className="mt-4 text-lg text-black/60">{query.subject || "Classroom"}</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">{query.classroom || "Teacher classroom"}</h2>
        <div className="mx-auto mt-9 w-fit rounded-2xl border border-black/15 bg-white p-4">
          <QRCodeSVG value={inviteUrl} size={220} level="M" marginSize={1} title="Classroom invite QR code" />
        </div>
        <p className="mt-7 text-sm text-black/55">Scan the QR code or enter this code in Exams</p>
        <code className="mt-3 inline-block rounded-xl bg-black px-6 py-4 font-mono text-2xl tracking-[0.18em] text-white">{joinCode}</code>
        <p className="mx-auto mt-6 max-w-lg break-all text-sm text-black/55">{inviteUrl}</p>
        <div className="mt-8 print:hidden"><PrintInviteButton /></div>
      </div>
    </main>
  );
}
