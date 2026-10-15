/**
 * 특수학급 시간표 자동 생성 로직 (timetable.py 의 브라우저용 TypeScript 포팅)
 *
 * 입력
 *  1) 특수학생 정보 — 화면에서 직접 입력 (학년 · 반 · 이름 · 수강 과목)
 *  2) 학급 시간표 엑셀 — A열 "1 - 1" 제목, 그 아래 1교시~7교시 행, B~F열 = 월~금 ("과목\n선생님")
 *  3) 특수학급 시간표 템플릿 워드(.docx) — 앱에 들어 있는 기본 양식
 *
 * 모든 처리는 브라우저 안에서만 이루어지며 파일이 서버로 전송되지 않습니다.
 */
import JSZip from "jszip";
import * as XLSX from "xlsx";

export const DAYS = ["월", "화", "수", "목", "금"] as const;
const SUBJECT_ORDER = ["국어", "영어", "수학", "스포츠"];
const FONT = "맑은 고딕";
const FONT_SIZE_HALF_PT = 18; // 9pt
const PERSONAL_FONT_SIZE_HALF_PT = 26; // 학생별 시간표의 과목명 13pt

const LINE_TW = 240; // 9pt 한 줄 높이(twip)
const GAP_TW = 80; // 과목 묶음 사이 간격
const PAD_TW = 120; // 칸 위아래 여백
const PAGE_SLACK_TW = 1000; // 템플릿 아래쪽 여유 공간(대략)
const WIDE_CELL_TW = 1500; // 이 너비 이상인 칸은 공간이 부족할 때 이름을 한 줄에 2명씩

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** 사용자에게 그대로 보여줄 수 있는 오류 */
export class TimetableError extends Error {}

export type Student = { grade: number; cls: number; name: string; subjects: string[] };
/** key: `${요일idx}-${교시}` */
export type ClassTimetables = Map<string, Map<string, string>>;
export type SubjectGroup = { subject: string; names: string[] };
/** key: `${요일idx}-${교시}` → 과목 순서(국어·영어·수학)대로 정렬된 묶음 */
export type Schedule = Map<string, SubjectGroup[]>;

export const slotKey = (day: number, period: number) => `${day}-${period}`;
const classKey = (grade: number, cls: number) => `${grade}-${cls}`;

// ---------------------------------------------------------------- 엑셀 읽기
type Row = unknown[];

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

/** '국어A' -> '국어', '수학B' -> '수학', '스포' -> '스포츠' */
export function baseSubject(raw: string): string {
  const s = raw.trim().replace(/[A-Za-zＡ-Ｚ]+$/, "");
  return s === "스포" ? "스포츠" : s;
}

function readRows(buf: ArrayBuffer, label: string): Row[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "array" });
  } catch {
    throw new TimetableError(`${label} 파일을 엑셀로 읽을 수 없습니다. .xlsx 파일인지 확인해 주세요.`);
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new TimetableError(`${label} 파일에 시트가 없습니다.`);
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: null, raw: true, blankrows: false });
}

export function readClassTimetables(buf: ArrayBuffer): ClassTimetables {
  const rows = readRows(buf, "학급 시간표");
  const result: ClassTimetables = new Map();
  let current: Map<string, string> | null = null;
  for (const row of rows) {
    const a = str(row[0]);
    let m = a.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      current = new Map();
      result.set(classKey(+m[1], +m[2]), current);
      continue;
    }
    m = a.match(/^(\d+)\s*교시$/);
    if (m && current) {
      const period = +m[1];
      for (let d = 0; d < 5; d++) {
        const v = row[1 + d];
        if (v) current.set(slotKey(d, period), baseSubject(String(v).split("\n")[0]));
      }
    }
  }
  if (result.size === 0) {
    throw new TimetableError(
      "학급 시간표에서 '1 - 1' 형식의 학급 제목을 찾지 못했습니다. 학급 시간표 파일이 맞는지 확인해 주세요.",
    );
  }
  return result;
}

export function buildSchedule(classTt: ClassTimetables, students: Student[]) {
  const slots = new Map<string, Map<string, string[]>>();
  const warnings: string[] = [];
  for (const st of students) {
    const tt = classTt.get(classKey(st.grade, st.cls));
    if (!tt) {
      warnings.push(`${st.grade}-${st.cls} 학급 시간표가 없어 ${st.name} 학생을 건너뛰었습니다.`);
      continue;
    }
    for (const [key, subj] of tt) {
      if (!st.subjects.includes(subj)) continue;
      if (!slots.has(key)) slots.set(key, new Map());
      const groups = slots.get(key)!;
      if (!groups.has(subj)) groups.set(subj, []);
      groups.get(subj)!.push(st.name);
    }
  }
  const rank = (s: string) => (SUBJECT_ORDER.includes(s) ? SUBJECT_ORDER.indexOf(s) : 99);
  const schedule: Schedule = new Map();
  for (const [key, groups] of slots) {
    const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b));
    schedule.set(key, order.map((subject) => ({ subject, names: groups.get(subject)! })));
  }
  return { schedule, warnings };
}

// ---------------------------------------------------------------- 워드(XML) 유틸
const kids = (el: Element, local: string) =>
  Array.from(el.childNodes).filter(
    (n): n is Element => n.nodeType === 1 && (n as Element).namespaceURI === W && (n as Element).localName === local,
  );
const kid = (el: Element | null | undefined, local: string) => (el ? (kids(el, local)[0] ?? null) : null);
const wAttr = (el: Element | null, name: string) => (el ? el.getAttributeNS(W, name) : null);
const setW = (el: Element, name: string, value: string) => el.setAttributeNS(W, `w:${name}`, value);
const mk = (doc: Document, local: string) => doc.createElementNS(W, `w:${local}`);

/** 스키마 순서를 지키도록 `following` 에 나열된 요소들 앞에 끼워 넣기 */
function insertBefore(parent: Element, el: Element, following: string[]) {
  const ref = Array.from(parent.childNodes).find(
    (c) => c.nodeType === 1 && (c as Element).namespaceURI === W && following.includes((c as Element).localName),
  );
  parent.insertBefore(el, ref ?? null);
}

function ensureChild(parent: Element, local: string, following: string[]): Element {
  let el = kid(parent, local);
  if (!el) {
    el = mk(parent.ownerDocument, local);
    insertBefore(parent, el, following);
  }
  return el;
}

function cellText(tc: Element): string {
  return Array.from(tc.getElementsByTagNameNS(W, "t"))
    .map((t) => t.textContent ?? "")
    .join("")
    .trim();
}

function gridSpan(tc: Element): number {
  const gs = kid(kid(tc, "tcPr"), "gridSpan");
  return gs ? parseInt(wAttr(gs, "val") || "1", 10) : 1;
}

type GridCell = { g0: number; g1: number; tc: Element };

function rowCellsWithGrid(tr: Element): GridCell[] {
  let pos = 0;
  const gb = kid(kid(tr, "trPr"), "gridBefore");
  if (gb) pos = parseInt(wAttr(gb, "val") || "0", 10);
  return kids(tr, "tc").map((tc) => {
    const span = gridSpan(tc);
    const cell = { g0: pos, g1: pos + span, tc };
    pos += span;
    return cell;
  });
}

function findTimetable(body: Element) {
  for (const tbl of kids(body, "tbl")) {
    for (const tr of kids(tbl, "tr")) {
      const texts = rowCellsWithGrid(tr).map((c) => cellText(c.tc));
      if (DAYS.every((d) => texts.includes(d))) return { tbl, header: tr };
    }
  }
  throw new TimetableError(
    "템플릿에서 '월 화 수 목 금' 머리행이 있는 표를 찾지 못했습니다. 특수학급 시간표 템플릿이 맞는지 확인해 주세요.",
  );
}

/** LibreOffice 변환 시 생기는 '맑은 고딕;Malgun Gothic' 같은 글꼴 이름 정리 */
function fixFonts(body: Element) {
  for (const el of Array.from(body.getElementsByTagNameNS(W, "rFonts"))) {
    for (const a of Array.from(el.attributes)) {
      if (a.value.includes(";")) el.setAttributeNS(a.namespaceURI, a.name, a.value.split(";")[0]);
    }
  }
}

const cellWidth = (tc: Element) => parseInt(wAttr(kid(kid(tc, "tcPr"), "tcW"), "w") || "0", 10);

function rowHeight(tr: Element) {
  return parseInt(wAttr(kid(kid(tr, "trPr"), "trHeight"), "val") || "0", 10);
}

function setRowHeight(tr: Element, twips: number) {
  const doc = tr.ownerDocument;
  let trPr = kid(tr, "trPr");
  if (!trPr) {
    trPr = mk(doc, "trPr");
    insertBefore(tr, trPr, ["tc", "customXml", "sdt", "bookmarkStart", "bookmarkEnd"]);
  }
  let h = kid(trPr, "trHeight");
  if (!h) {
    h = mk(doc, "trHeight");
    trPr.appendChild(h);
  }
  setW(h, "val", String(Math.trunc(twips)));
  setW(h, "hRule", "atLeast");
  if (!kid(trPr, "cantSplit")) trPr.insertBefore(mk(doc, "cantSplit"), trPr.firstChild);
}

function nameLines(names: string[], perLine: number) {
  const out: string[] = [];
  for (let i = 0; i < names.length; i += perLine) out.push(names.slice(i, i + perLine).join(" "));
  return out;
}

function neededHeight(groups: SubjectGroup[], perLine = 1) {
  const lines = groups.reduce((n, g) => n + 1 + nameLines(g.names, perLine).length, 0);
  return lines * LINE_TW + Math.max(0, groups.length - 1) * GAP_TW + PAD_TW;
}

const PPR_AFTER_SPACING = [
  "ind", "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc", "textDirection", "textAlignment",
  "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr", "pPrChange",
];
const TCPR_AFTER_VALIGN = ["hideMark", "headers", "cellIns", "cellDel", "cellMerge", "tcPrChange"];
const TCPR_AFTER_GRIDSPAN = [
  "hMerge", "vMerge", "tcBorders", "shd", "noWrap", "tcMar", "textDirection", "tcFitText", "vAlign",
  ...TCPR_AFTER_VALIGN,
];
const TCPR_AFTER_TCW = ["gridSpan", ...TCPR_AFTER_GRIDSPAN];

type CellLine = { text: string; beforeTw?: number };

/** 칸의 기존 문단을 지우고 가운데 정렬된 굵은 글씨 줄들로 채우기 */
function writeCell(tc: Element, lines: CellLine[], sizeHalfPt: number) {
  const doc = tc.ownerDocument;
  // 기존 문단 지우고 첫 문단의 서식(가운데 정렬 등)만 유지
  const paras = kids(tc, "p");
  const proto = mk(doc, "p");
  const protoPPr = kid(paras[0], "pPr");
  if (protoPPr) proto.appendChild(protoPPr.cloneNode(true));
  paras.forEach((p) => tc.removeChild(p));

  const newPara = (text: string, beforeTw = 0) => {
    const p = proto.cloneNode(true) as Element;
    const pPr = kid(p, "pPr") ?? p.insertBefore(mk(doc, "pPr"), p.firstChild);
    const spacing = ensureChild(pPr, "spacing", PPR_AFTER_SPACING);
    setW(spacing, "before", String(beforeTw));
    setW(spacing, "after", "0");
    setW(spacing, "line", "240");
    setW(spacing, "lineRule", "auto");

    const r = mk(doc, "r");
    const rPr = mk(doc, "rPr");
    const fonts = mk(doc, "rFonts");
    for (const k of ["ascii", "hAnsi", "eastAsia"]) setW(fonts, k, FONT);
    const size = mk(doc, "sz");
    setW(size, "val", String(sizeHalfPt));
    rPr.appendChild(fonts);
    rPr.appendChild(mk(doc, "b"));
    rPr.appendChild(size);
    const t = mk(doc, "t");
    t.setAttributeNS(XML_NS, "xml:space", "preserve");
    t.textContent = text;
    r.appendChild(rPr);
    r.appendChild(t);
    p.appendChild(r);
    tc.appendChild(p);
  };

  const tcPr = kid(tc, "tcPr") ?? tc.insertBefore(mk(doc, "tcPr"), tc.firstChild);
  setW(ensureChild(tcPr, "vAlign", TCPR_AFTER_VALIGN), "val", "center");

  for (const line of lines) newPara(line.text, line.beforeTw);
}

function fillCell(tc: Element, groups: SubjectGroup[], perLine: number) {
  const lines = groups.flatMap((g, i) => [
    { text: `[${g.subject}]`, beforeTw: i ? GAP_TW : 0 }, // 과목 묶음 사이 작은 간격
    ...nameLines(g.names, perLine).map((text) => ({ text })),
  ]);
  writeCell(tc, lines, FONT_SIZE_HALF_PT);
}

/** 나뉜 칸들을 하나로 합치고 `target` 칸의 서식(색상)을 남김 */
function mergeCells(target: Element, cells: Element[]) {
  if (cells.length < 2) return;
  const doc = target.ownerDocument;
  const span = cells.reduce((n, tc) => n + gridSpan(tc), 0);
  const width = cells.reduce((n, tc) => n + cellWidth(tc), 0);
  const tr = cells[0].parentNode as Element;
  if (target !== cells[0]) tr.insertBefore(target, cells[0]);
  for (const tc of cells) if (tc !== target) tr.removeChild(tc);
  const tcPr = kid(target, "tcPr") ?? target.insertBefore(mk(doc, "tcPr"), target.firstChild);
  setW(ensureChild(tcPr, "tcW", TCPR_AFTER_TCW), "w", String(width));
  setW(ensureChild(tcPr, "gridSpan", TCPR_AFTER_GRIDSPAN), "val", String(span));
}

async function openDocx(buf: ArrayBuffer) {
  const head = new Uint8Array(buf.slice(0, 2));
  if (head[0] !== 0x50 || head[1] !== 0x4b) {
    throw new TimetableError(
      "템플릿이 구형 워드(.doc) 형식이거나 워드 파일이 아닙니다. 워드에서 '다른 이름으로 저장 → .docx'로 저장한 뒤 다시 올려 주세요.",
    );
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new TimetableError("워드 파일을 열 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.");
  }
  const entry = zip.file("word/document.xml");
  if (!entry) {
    throw new TimetableError("워드(.docx) 파일이 아닙니다. 특수학급 시간표 템플릿을 올려 주세요.");
  }
  const xml = new DOMParser().parseFromString(await entry.async("string"), "application/xml");
  if (xml.getElementsByTagName("parsererror").length) {
    throw new TimetableError("워드 문서 내용을 해석하지 못했습니다.");
  }
  const body = xml.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new TimetableError("워드 문서 본문을 찾지 못했습니다.");
  return { zip, xml, body };
}

// ---------------------------------------------------------------- 업로드 단계별 확인
export type FileCheck = { summary: string; details: string[] };

export function inspectClassTimetables(buf: ArrayBuffer): FileCheck {
  const tt = readClassTimetables(buf);
  const grades = new Set([...tt.keys()].map((k) => k.split("-")[0]));
  return { summary: `학급 ${tt.size}개`, details: [`${[...grades].sort().join(", ")}학년 시간표`] };
}

// ---------------------------------------------------------------- 학년도 · 학기 · 선생님
export type Teacher = { name: string; room: string; color: string };
export type TemplateSettings = { year: string; term: string; teachers: Teacher[] };

const TITLE_YEAR = /\d{4}\s*학년도/;
const TITLE_TERM = /\d\s*학기/;
const TEACHER_TEXT = /^(.*?)\s*선생님\s*(?:\((.*?)\))?\s*$/;

function titleParagraph(body: Element) {
  return kids(body, "p").find((p) => TITLE_YEAR.test(cellText(p))) ?? null;
}

/** 시간표 표가 아닌 표에서 '○○○ 선생님(교실)' 칸과 그 왼쪽 색상 칸 찾기 */
function teacherCells(body: Element, timetable: Element) {
  const out: { tc: Element; color: string }[] = [];
  for (const tbl of kids(body, "tbl")) {
    if (tbl === timetable) continue;
    for (const tr of kids(tbl, "tr")) {
      const tcs = kids(tr, "tc");
      tcs.forEach((tc, i) => {
        if (!cellText(tc).includes("선생님")) return;
        const swatch = i > 0 ? tcs[i - 1] : null;
        const fill = wAttr(kid(kid(swatch, "tcPr"), "shd"), "fill");
        out.push({ tc, color: fill && /^[0-9A-Fa-f]{6}$/.test(fill) ? `#${fill}` : "" });
      });
    }
  }
  return out;
}

/** 문단의 첫 글자 서식은 그대로 두고 글자만 바꾸기 */
function setParagraphText(p: Element, text: string) {
  const runs = kids(p, "r").filter((r) => kid(r, "t"));
  if (!runs.length) return;
  const t = kid(runs[0], "t")!;
  t.setAttributeNS(XML_NS, "xml:space", "preserve");
  t.textContent = text;
  for (const r of runs.slice(1)) p.removeChild(r);
}

export async function readTemplateSettings(buf: ArrayBuffer): Promise<TemplateSettings> {
  const { body } = await openDocx(buf);
  const { tbl } = findTimetable(body);
  const titleP = titleParagraph(body);
  const title = titleP ? cellText(titleP) : "";
  const teachers = teacherCells(body, tbl).map(({ tc, color }) => {
    const m = cellText(tc).match(TEACHER_TEXT);
    return { name: m?.[1].trim() ?? "", room: m?.[2]?.trim() ?? "", color };
  });
  return {
    year: title.match(TITLE_YEAR)?.[0].replace(/\D/g, "") ?? String(new Date().getFullYear()),
    term: title.match(TITLE_TERM)?.[0].replace(/\D/g, "") ?? "1",
    teachers,
  };
}

export const titleFor = (s: Pick<TemplateSettings, "year" | "term">) => `${s.year}학년도 ${s.term}학기 특수학급 시간표`;
export const teacherLabel = (t: Teacher) => `${t.name} 선생님${t.room ? `(${t.room})` : ""}`;

function applySettings(body: Element, timetable: Element, settings: TemplateSettings) {
  const title = titleParagraph(body);
  if (title) {
    const text = cellText(title)
      .replace(TITLE_YEAR, `${settings.year}학년도`)
      .replace(TITLE_TERM, `${settings.term}학기`);
    setParagraphText(title, text);
  }
  teacherCells(body, timetable).forEach(({ tc }, i) => {
    const t = settings.teachers[i];
    const p = kids(tc, "p").find((x) => cellText(x).includes("선생님"));
    if (t && p) setParagraphText(p, teacherLabel(t));
  });
}

// ---------------------------------------------------------------- 템플릿 채우기
/** 템플릿을 열고 교시 행마다 요일별 칸 목록을 준비 */
async function openTimetable(templateBuf: ArrayBuffer, settings?: TemplateSettings) {
  const { zip, xml, body } = await openDocx(templateBuf);
  fixFonts(body);
  const { tbl, header } = findTimetable(body);
  if (settings) applySettings(body, tbl, settings);

  // 머리행에서 요일별 grid 범위 계산
  const dayRanges = new Map<number, [number, number]>();
  for (const { g0, g1, tc } of rowCellsWithGrid(header)) {
    const d = (DAYS as readonly string[]).indexOf(cellText(tc));
    if (d >= 0) dayRanges.set(d, [g0, g1]);
  }

  const rows: { tr: Element; period: number; dayCells: Map<number, Element[]> }[] = [];
  for (const tr of kids(tbl, "tr")) {
    const cells = rowCellsWithGrid(tr);
    if (!cells.length) continue;
    const m = cellText(cells[0].tc).match(/^(\d+)\s*교시/);
    if (!m) continue;
    const dayCells = new Map<number, Element[]>();
    for (const [d, [d0, d1]] of dayRanges) {
      dayCells.set(d, cells.filter((c) => c.g0 >= d0 && c.g1 <= d1).map((c) => c.tc));
    }
    rows.push({ tr, period: +m[1], dayCells });
  }
  return { zip, xml, rows };
}

async function saveDocx(zip: JSZip, xml: Document) {
  let out = new XMLSerializer().serializeToString(xml);
  if (!out.startsWith("<?xml")) out = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${out}`;
  zip.file("word/document.xml", out);
  return zip.generateAsync({ type: "blob", mimeType: DOCX_MIME, compression: "DEFLATE" });
}

/** 전체 특수학급 시간표: 각 칸에 [과목] / 학생 이름 */
export async function fillTemplate(templateBuf: ArrayBuffer, schedule: Schedule, settings?: TemplateSettings) {
  const { zip, xml, rows } = await openTimetable(templateBuf, settings);

  // 1) 배치 계획: 행마다 [(칸, 과목묶음)]
  const notes: string[] = [];
  const plan: { tr: Element; items: { tc: Element; groups: SubjectGroup[] }[] }[] = [];
  for (const { tr, period, dayCells: byDay } of rows) {
    const items: { tc: Element; groups: SubjectGroup[] }[] = [];
    for (const [d, dayCells] of byDay) {
      const groups = schedule.get(slotKey(d, period)) ?? [];
      if (!dayCells.length || !groups.length) continue;
      if (dayCells.length === 1) {
        items.push({ tc: dayCells[0], groups });
      } else {
        // 칸이 나뉜 경우: 과목 묶음을 왼쪽부터 차례로 배치
        const buckets: SubjectGroup[][] = dayCells.map(() => []);
        groups.forEach((g, i) => buckets[Math.min(i, dayCells.length - 1)].push(g));
        dayCells.forEach((tc, i) => buckets[i].length && items.push({ tc, groups: buckets[i] }));
        if (groups.length < dayCells.length) {
          notes.push(`${DAYS[d]} ${period}교시: 칸은 ${dayCells.length}개로 나뉘어 있으나 과목은 ${groups.length}개입니다.`);
        }
      }
    }
    plan.push({ tr, items });
  }

  // 2) 한 페이지(템플릿 원래 높이 합) 안에 들어가도록 이름 배치 방식 결정
  const budget = plan.reduce((s, { tr }) => s + rowHeight(tr), 0);
  const perLineFor = (tc: Element, compact: boolean) => (compact && cellWidth(tc) >= WIDE_CELL_TW ? 2 : 1);
  const rowNeeds = (compact: boolean) =>
    plan.map(({ items }) => Math.max(0, ...items.map(({ tc, groups }) => neededHeight(groups, perLineFor(tc, compact)))));
  const total = (needs: number[]) => plan.reduce((s, { tr }, i) => s + Math.max(rowHeight(tr), needs[i]), 0);

  const compact = total(rowNeeds(false)) > budget;
  const needs = rowNeeds(compact);

  // 3) 채우기
  for (const { items } of plan) {
    for (const { tc, groups } of items) fillCell(tc, groups, perLineFor(tc, compact));
  }

  // 4) 행 높이 재분배
  if (total(needs) > budget) {
    const sumNeeds = needs.reduce((a, b) => a + b, 0);
    const extra = Math.max(0, (budget - sumNeeds) / plan.length);
    plan.forEach(({ tr }, i) => setRowHeight(tr, needs[i] + extra));
    if (sumNeeds > budget + PAGE_SLACK_TW) notes.push("내용이 많아 한 페이지를 넘을 수 있습니다.");
  } else {
    plan.forEach(({ tr }) => setRowHeight(tr, rowHeight(tr)));
  }
  if (compact) notes.push("한 페이지에 맞추기 위해 넓은 칸은 이름을 한 줄에 2명씩 배치했습니다.");

  return { blob: await saveDocx(zip, xml), notes };
}

/** 한 학생이 특수학급에서 수업하는 교시 → 과목 (`${요일idx}-${교시}` 기준). 학급 시간표가 없으면 null */
export function studentSlots(classTt: ClassTimetables, st: Student): Map<string, string> | null {
  const tt = classTt.get(classKey(st.grade, st.cls));
  if (!tt) return null;
  const slots = new Map<string, string>();
  for (const [key, subj] of tt) if (st.subjects.includes(subj)) slots.set(key, subj);
  return slots;
}

/**
 * 학생 개인 시간표: 템플릿의 칸 색상(선생님 구분)과 행 높이는 그대로 두고, 수업하는 칸에 과목명만 채움.
 * 나뉜 칸은 하나로 합치되, 전체 시간표에서 그 학생의 과목이 놓인 칸의 색상을 따름.
 */
export async function fillStudentTemplate(
  templateBuf: ArrayBuffer,
  schedule: Schedule,
  slots: Map<string, string>,
  settings?: TemplateSettings,
) {
  const { zip, xml, rows } = await openTimetable(templateBuf, settings);
  for (const { period, dayCells: byDay } of rows) {
    for (const [d, dayCells] of byDay) {
      if (!dayCells.length) continue;
      const key = slotKey(d, period);
      const subject = slots.get(key);
      let target = dayCells[0];
      if (dayCells.length > 1) {
        const idx = subject ? (schedule.get(key) ?? []).findIndex((g) => g.subject === subject) : 0;
        target = dayCells[Math.min(Math.max(idx, 0), dayCells.length - 1)];
        mergeCells(target, dayCells);
      }
      if (subject) writeCell(target, [{ text: subject }], PERSONAL_FONT_SIZE_HALF_PT);
    }
  }
  return saveDocx(zip, xml);
}
