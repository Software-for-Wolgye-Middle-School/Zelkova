@AGENTS.md

# 느티나무 교실 도우미 (timetable-app)

A Next.js 16 / React 19 app of classroom tools for a middle-school special-education class. All UI text,
code comments, and commit messages are in Korean — keep it that way.

## Runtime & commands

- **Node.js: always use the latest release (currently Node 26 LTS).** Pinned via `.nvmrc` and `engines` in
  `package.json`; keep `@types/node` on the same major. When a newer stable Node major ships, bump all three.
- `npm run dev` (http://localhost:3000) · `npm run build` · `npm start` · `npm run lint`
- Typecheck: `npx tsc --noEmit`. There is no unit-test framework; verify changes with typecheck, lint, the
  scripts below, and by running the app.
- Next config uses `cacheComponents` + `partialPrefetching`; dynamic route handlers call `await connection()`.
  Read `node_modules/next/dist/docs/` before using any Next API (see AGENTS.md).

## Layout

- `src/app/page.tsx` → `TimetableApp` is the whole shell: landing page + tool cards. Tools are registered in
  `src/components/tools.ts` (`TOOLS`); `TimetableApp.openTool` maps a tool id to its `*App.tsx` component.
- `src/components/*App.tsx` — one component per tool (timetable, promise board, bankbook, name tag, meals,
  handwriting, students, duty log, guide chat, IEP).
- `src/lib/` — server and shared logic. `*Svg.ts` draw printable output as SVG; `*Store.ts` are persistence.
- `src/app/api/*` — route handlers. Most require login via `isAuthed(request)` from `src/lib/auth.ts`.
- `scripts/` — CLI tools (see below). `public/templates/` — school form files (`iep-form.hwp`,
  `special-class-template.docx`).
- `README.md` (English) and `README.KR.md` (Korean) are user-facing overviews; keep both in sync when tools change.

## Storage & auth

- Stores (`iepStore`, `studentStore`, `dutyLogStore`, `kv`, …) use Upstash Redis REST when
  `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) are set, otherwise JSON files under
  `data/` (or `STUDENTS_DATA_DIR`). Both paths must keep working. `data/` and `.env*` are gitignored.
- Auth: credentials only in env vars, scrypt-hashed. Roles `user` / `admin` (`SUPER_ADMIN_*`) / `teacher`
  (`TEACHER_*`). Generate with `node scripts/hash-password.mjs [--super|--teacher] <id> <password>`.
- Privacy: never send student names or personal data to external AI services; no AI features inside the IEP tool.

## 개별화교육계획 작성하기 (IEP) — HWP editor ↔ downloaded file must match exactly

The IEP tool is a web editor that looks like the school's 한글 (HWP 5.0) form, and downloads a `.hwp` file.
**Hard requirement: what the user sees in the editor must be exactly what they get in the downloaded HWP —
same text, same table structure, same paragraph/character formatting, same row heights and same page breaks.**
Any change to either side must preserve this parity; never change the editor's rendering without the
file output (or vice versa).

How parity is achieved — one composition feeds both outputs:

- `src/lib/iepCompose.ts` `assemble()` clones blocks from the blank school form (`public/templates/iep-form.hwp`,
  loaded by `iepFormFile.ts`) per student / per subject, adjusts goal rows, and fills cells.
  - `buildIepV2Hwp()` → serializes that document to the `.hwp` (`GET /api/iep/hwp?id=`), after `verifyRecords`.
  - `layoutIepV2()` → reads the *same* assembled document with `readFormDoc` and returns tables/cells/styles plus
    `Bind`s (which stored field each cell edits) to the editor (`POST /api/iep/layout`).
- `src/components/IepApp.tsx` (`DocV2`, `CellV2`, `paginate`) renders that layout in HWP units → px
  (1 px = 75 HWP units at 96 dpi; HWP unit = 1/7200 in) and paginates like 한글 (forced page starts, unsplittable
  tables move whole, splittable tables break by row, trailing empty paragraphs dropped).
  - The assembler sets splittable tables to 「셀 단위로 나눔」, so 한글 never cuts a row in half — but it also never breaks
    between rows joined by a merged cell (e.g. the whole 단기목표 block moves to the next page); the editor does the same.
  - In table cells 한글 puts no line spacing under the last line (cell height = last line top + text height + padding).
  - An in-line (글자처럼 취급) table is followed by its paragraph's line-spacing gap, and its outer margins count toward
    the page height.
  - Line wrapping is measured at the text's font size, not the paragraph-end mark's (forms often have 9pt text + 10pt end).
- HWP internals: `hwpEdit.ts` (record parse/serialize, clone, set text, insert/delete rows — clears
  `PARA_LINE_SEG` on edited paragraphs so 한글 re-flows them), `hwpForm.ts` (read form → renderable styles),
  `hwpMeasure.ts` (heights/line counts; note paragraph margins/indent are stored ×2 in the file),
  `hwpLines.ts` (한글's saved line segments, used as ground truth).
- Data model: flat `field → string` map (`iep.ts`, field names documented in `iepV2.ts`), real-time
  co-editing with per-field revisions and 3-way merge (`iepStore.ts`, `useIepSync.ts`).
- Legacy: `iepHwp.ts` and the `writeForm` branch in the HWP route serve older documents (non-`iep-v2` forms).

Verifying parity (do this after any IEP layout/format change):

- `npx tsx scripts/editor-compare.ts [--heavy]` — builds the HWP and opens the editor in real Chrome at zoom 50–200%,
  comparing page/paragraph/row heights; it spins up its own `next dev` with temp data (`--heavy` uses a long document
  whose tables cross pages). Differences should be within 1px.
- `npx tsx scripts/hwp-inspect.ts <file.hwp> [--blocks|--lines]` — compare computed vs 한글-saved line breaks.
- `node --experimental-strip-types scripts/hwp.mjs <info|paras|table|get|verify|dump|…> <file.hwp>` — inspect/edit
  HWP files without breaking the format.
- Text must match the school's original form character-for-character (including trailing spaces and labels).

## Other notes

- Do not add an "import students from HWP" feature; load HWP data via scripts and existing APIs instead.
- `scripts/import-duty-log.mjs` bulk-loads duty-log JSON into the same store the app uses.
- Commits: `feat:` / `fix:` prefix with a Korean description.
