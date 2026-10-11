# Nano Syllabus

Nano Syllabus is a Nepal-focused AI study companion. The student app owns auth,
onboarding, chat UX, notes, billing, settings, and persistence. Academic subject
catalogs and answer generation come from the external tenant API.

## Current Architecture

- Users authenticate and keep profiles in Supabase.
- Onboarding and subject selectors read semester-aware subject metadata through
  the tenant API proxy routes.
- Chat sends the raw student question to the tenant `/v1/prompt` endpoint with
  the selected subject metadata.
- The app does not run local retrieval, local embeddings, local question-bank routing,
  local model answering, or local knowledge chunk retrieval.
- Chat history, notes, feedback, credits, and admin review still persist in
  Supabase.
- Binary uploads live on the Nano Syllabus VPS; Supabase Storage is not required.

## Repository Structure

```text
app/         Next.js pages and API routes
components/  UI and client interaction layers
lib/         Supabase, billing, tenant API, and app data helpers
supabase/    SQL migrations
tests/       Vitest and tenant API integration coverage
docs/        Product and operations notes
```

## Required Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TENANT_API_BASE_URL`
- `TENANT_API_TOKEN`
- `TEACHER_APP_API_TOKEN` required for creating teacher workspaces
- `VPS_STORAGE_URL`, `VPS_STORAGE_TOKEN`, and `VPS_STORAGE_SIGNING_SECRET`
  optionally override the tenant API URL/token used by VPS object storage.
- `TENANT_API_REJECT_UNAUTHORIZED` optional, defaults to `0`
- `TENANT_API_TIMEOUT_MS` optional, minimum enforced timeout is `30000`
- `GOOGLE_DRIVE_API_KEY` optional. A Google Cloud API key with the Drive API
  enabled. Without it a creator can import a link to a single file shared as
  "Anyone with the link"; with it, folder links work too and filenames, sizes
  and file types are known before anything is downloaded. It is an API key and
  deliberately not OAuth — reading a private Drive needs the restricted
  `drive.readonly` scope, which Google gates behind a security assessment.

## Common Commands

```bash
npm install
npm run dev
npm test
npm run test:integration
npm run test:tenant-prompt
npm run build
```

## Important Boundary

Do not reintroduce app-side answer generation. If the tenant API fails, the app
should surface a debuggable tenant/API error instead of answering from a local
corpus or model.

## Landing pages for subdomains

In **Admin → Websites**, use **Browse 5 samples** or **New subdomain** to choose
Original, Editorial, Academy, Studio, or Community. Each sample has a distinct
layout and a full desktop/phone preview. A new site starts hidden.

Open a site to customise its content, logo, colours, images, and visible sections.
**Design & layout** controls typography, corners, section spacing, background,
text colour, hero image, and the product tour. **Choose sample** can change the
layout while keeping your copy, branding, destination, and uploaded hero image;
uncheck **Keep my current text and branding** to load sample copy and colours.
Changes autosave to the draft. Publish, then make the site live when ready.

The sample and all edits persist in the existing `landing_sites` draft/content
JSON. Existing pages retain the Original design; no database migration is needed.
Subdomains use the existing wildcard-domain routing, including `slug.localhost:3000`
for local development.

With the development app and local Supabase running, `npm run test:landing-ui`
checks creation, editing, autosave, template switching, publishing, subdomain
rendering, and all five samples on desktop and phone. It creates and removes a
temporary local admin account and sites, and saves screenshots under `/tmp`.

## Phone camera content uploads

In a creator subject, open **Upload syllabus**, **Add material**, or **Add past paper**,
then choose **Phone camera**. The desktop displays a QR code; it does not open a camera.
Scan on your phone (no login needed). Use **Take photo** or **Choose photos**, collect up
to 50 pages, swipe through previews, and drag thumbnails into order. Compression runs
on the phone as photos are added. A local IndexedDB draft survives refresh until the
link expires, subject to the browser's storage availability.

On the phone, name the document and choose **Create PDF**, preview or save it, then
**Send PDF to desktop**. The phone creates the PDF from compressed JPEGs without sending
individual photos. Within about three seconds the desktop shows the finished PDF.
Choose **Upload PDF and index** to import it into the selected shelf using the existing
creator upload flow. Sending the PDF alone does not start indexing.

All handoff metadata and the temporary finished PDF use private VPS `content-camera`
objects. Photos remain on the phone; this flow never writes photos, PDFs, or handoff
metadata to Supabase. Supabase still authenticates the creator's existing account.
The historical `content_camera_sessions` table is no longer required by this flow.
Links expire after two hours and are revoked when the desktop dialog closes or import
succeeds. Only the final document in the existing VPS shelf is retained after import.

Deploy the object-storage backend alongside the frontend to enable its private paginated
listing endpoint and atomic create-only uploads. Expired handoffs are swept when a new
session opens. For idle cleanup, set `CRON_SECRET` and schedule
`GET /api/cron/content-camera-cleanup` every 15 minutes with
`Authorization: Bearer <CRON_SECRET>`. Manifests are kept until five minutes after expiry
to cover signed uploads in flight. Run `npm run test:content-camera-ui` against the local
development database to verify the complete flow using a disposable VPS collection.

For phone testing, open the desktop using a reachable LAN address or HTTPS development
URL; a QR containing `localhost` points at the phone itself.
