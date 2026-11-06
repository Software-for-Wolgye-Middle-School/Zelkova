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
/** 글자 크기는 반 포인트 단위 (18 = 9pt). 한 페이지를 넘으면 큰 크기부터 차례로 줄여 봄 */
const FONT_SIZES_HALF_PT = [18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8]; // 전체 시간표 이름: 9pt ~ 4pt
const PERSONAL_FONT_SIZES_HALF_PT = [26, 24, 22, 20, 18, 16, 14]; // 학생별 시간표 과목명: 13pt ~ 7pt

const LINE_FACTOR = 1.3; // 채우는 칸의 줄 높이 = 글자 크기 × 1.3 (고정 줄 간격)
const FONT_LINE_FACTOR = 1.33; // 맑은 고딕 '1줄' 간격의 줄 높이 (양식의 다른 문단 높이를 어림할 때)
const PAD_TW = 120; // 칸 위아래 여백
const CELL_SIDE_TW = 204; // 칸 왼쪽 + 오른쪽 안쪽 여백
const PAGE_SAFETY_TW = 900; // 어림 오차 여유 (Word 로 확인: 이 양식은 700 이상이어야 한 쪽에 들어감)

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

// ---------------------------------------------------------------- 한 페이지 맞추기 (높이 어림)
const lineTw = (sizeHalfPt: number) => Math.round(sizeHalfPt * 10 * LINE_FACTOR);
const gapTw = (sizeHalfPt: number) => Math.round(sizeHalfPt * 4.5); // 과목 묶음 사이 간격 (9pt 에서 80)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** 한글 · 한자 · 전각 문자 */
const FULL_WIDTH = /[ᄀ-ᇿ　-鿿가-힯＀-￯]/;

/** 굵은 글씨로 쓴 글자의 대략 너비 (한글 1글자 = 글자 크기, 영문 · 숫자 0.6, 빈칸 0.3) */
function textWidthTw(text: string, sizeHalfPt: number) {
  let em = 0;
  for (const ch of text) em += FULL_WIDTH.test(ch) ? 1 : ch === " " ? 0.3 : 0.6;
  return em * sizeHalfPt * 10 * 1.05;
}

/** 칸 너비 안에서 몇 줄로 나뉘는지 */
const wrapCount = (text: string, sizeHalfPt: number, widthTw: number) =>
  Math.max(1, Math.ceil(textWidthTw(text, sizeHalfPt) / Math.max(widthTw, 1)));

/**
 * 칸에 이름을 놓는 방식 (공간이 모자랄수록 뒤의 방식)
 *  - column: [과목] 아래에 이름을 한 줄에 한 명씩
 *  - packed: [과목] 아래에 칸 너비에 들어가는 만큼 한 줄에 여러 명
 *  - inline: [과목] 바로 옆부터 이어서 여러 명
 */
type Packing = "column" | "packed" | "inline";
const PACKINGS: Packing[] = ["column", "packed", "inline"];

/** 낱말들을 칸 너비에 들어가는 만큼 한 줄에 이어 붙임 */
function packWords(words: string[], sizeHalfPt: number, widthTw: number) {
  const out: string[] = [];
  for (const word of words) {
    const last = out[out.length - 1];
    if (last !== undefined && textWidthTw(`${last} ${word}`, sizeHalfPt) <= widthTw) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out;
}

function groupLines(groups: SubjectGroup[], sizeHalfPt: number, widthTw: number, packing: Packing): CellLine[] {
  return groups.flatMap((g, i) => {
    const head = `[${g.subject}]`;
    const lines =
      packing === "column"
        ? [head, ...g.names]
        : packing === "packed"
          ? [head, ...packWords(g.names, sizeHalfPt, widthTw)]
          : packWords([head, ...g.names], sizeHalfPt, widthTw);
    return lines.map((text, j) => ({ text, beforeTw: i && !j ? gapTw(sizeHalfPt) : 0 })); // 과목 묶음 사이 작은 간격
  });
}

function linesHeight(lines: CellLine[], sizeHalfPt: number, widthTw: number) {
  return sum(lines.map((l) => wrapCount(l.text, sizeHalfPt, widthTw) * lineTw(sizeHalfPt) + (l.beforeTw ?? 0))) + PAD_TW;
}

const contentWidth = (tc: Element) => cellWidth(tc) - CELL_SIDE_TW;

type ParaStyle = { size: number; line: number; rule: string; before: number; after: number };
type Styles = { byId: Map<string, ParaStyle>; fallback: ParaStyle };

const intAttr = (el: Element | null, name: string) => {
  const v = wAttr(el, name);
  return v ? parseInt(v, 10) : undefined;
};

/** styles.xml 의 문단 스타일별 글자 크기 · 줄 간격 (basedOn 을 따라 올라가며 채움) */
async function readStyles(zip: JSZip): Promise<Styles> {
  const text = await zip.file("word/styles.xml")?.async("string");
  const doc = text ? new DOMParser().parseFromString(text, "application/xml") : null;
  const defaults = doc?.getElementsByTagNameNS(W, "docDefaults")[0];
  const defaultSize = intAttr(defaults?.getElementsByTagNameNS(W, "sz")[0] ?? null, "val") ?? 24;
  const raw = new Map<string, { based?: string; size?: number; spacing: Element | null; isDefault: boolean }>();
  for (const st of Array.from(doc?.getElementsByTagNameNS(W, "style") ?? [])) {
    if (wAttr(st, "type") !== "paragraph") continue;
    raw.set(wAttr(st, "styleId") ?? "", {
      based: wAttr(kid(st, "basedOn"), "val") ?? undefined,
      size: intAttr(kid(kid(st, "rPr"), "sz"), "val"),
      spacing: kid(kid(st, "pPr"), "spacing"),
      isDefault: wAttr(st, "default") === "1",
    });
  }
  const resolve = (id: string | undefined, depth = 0): ParaStyle => {
    const st = id === undefined ? undefined : raw.get(id);
    const base =
      st?.based && depth < 10 ? resolve(st.based, depth + 1) : { size: defaultSize, line: 240, rule: "auto", before: 0, after: 0 };
    if (!st) return base;
    return {
      size: st.size ?? base.size,
      line: intAttr(st.spacing, "line") ?? base.line,
      rule: wAttr(st.spacing, "lineRule") ?? base.rule,
      before: intAttr(st.spacing, "before") ?? base.before,
      after: intAttr(st.spacing, "after") ?? base.after,
    };
  };
  const byId = new Map([...raw.keys()].map((id) => [id, resolve(id)]));
  const defaultId = [...raw].find(([, st]) => st.isDefault)?.[0] ?? "Normal";
  return { byId, fallback: byId.get(defaultId) ?? resolve(undefined) };
}

/** 양식에 원래 있던 문단 높이 어림 (가장 큰 글자 기준, 너비를 넘으면 여러 줄) */
function paragraphHeight(p: Element, widthTw: number, styles: Styles) {
  const pPr = kid(p, "pPr");
  const style = styles.byId.get(wAttr(kid(pPr, "pStyle"), "val") ?? "") ?? styles.fallback;
  const sizes = Array.from(p.getElementsByTagNameNS(W, "sz")).map((el) => intAttr(el, "val") ?? 0);
  const size = sizes.length ? Math.max(...sizes) : style.size;
  const spacing = kid(pPr, "spacing");
  const line = intAttr(spacing, "line") ?? style.line;
  const rule = wAttr(spacing, "lineRule") ?? style.rule;
  const natural = size * 10 * FONT_LINE_FACTOR;
  const lineH = rule === "exact" ? line : rule === "atLeast" ? Math.max(line, natural) : (natural * line) / 240;
  const text = cellText(p);
  const lines = text ? wrapCount(text, size, widthTw) : 1;
  return lines * lineH + (intAttr(spacing, "before") ?? style.before) + (intAttr(spacing, "after") ?? style.after);
}

function cellContentHeight(tc: Element, styles: Styles) {
  return sum(kids(tc, "p").map((p) => paragraphHeight(p, contentWidth(tc), styles))) + 56; // 칸 위아래 안쪽 여백
}

function estimatedRowHeight(tr: Element, styles: Styles) {
  return Math.max(rowHeight(tr), ...kids(tr, "tc").map((tc) => cellContentHeight(tc, styles)));
}

/** 교시 행에 쓸 수 있는 높이 = 쪽 높이 − 위아래 여백 − 교시 행이 아닌 모든 내용 */
function periodRowBudget(body: Element, periodRows: Set<Element>, styles: Styles) {
  const sect = kid(body, "sectPr");
  const pgSz = kid(sect, "pgSz");
  const pgMar = kid(sect, "pgMar");
  const pageW = (intAttr(pgSz, "w") ?? 11906) - (intAttr(pgMar, "left") ?? 1440) - (intAttr(pgMar, "right") ?? 1440);
  const pageH = (intAttr(pgSz, "h") ?? 16838) - (intAttr(pgMar, "top") ?? 1440) - (intAttr(pgMar, "bottom") ?? 1440);
  let used = 0;
  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType !== 1 || (node as Element).namespaceURI !== W) continue;
    const el = node as Element;
    if (el.localName === "p") used += paragraphHeight(el, pageW, styles);
    else if (el.localName === "tbl") {
      for (const tr of kids(el, "tr")) if (!periodRows.has(tr)) used += estimatedRowHeight(tr, styles);
    }
  }
  return pageH - used - PAGE_SAFETY_TW;
}

/**
 * 교시 행 높이 정하기. 양식 높이로 들어가면 그대로, 아니면 양식의 높이 비율을 지키며
 * 줄이되 내용보다 낮아지지 않게 함 (호출하는 쪽에서 sum(needs) <= budget 을 맞춤)
 */
function layoutRows(bases: number[], needs: number[], budget: number) {
  const natural = bases.map((b, i) => Math.max(b, needs[i]));
  if (sum(natural) <= budget) return natural;
  const at = (s: number) => bases.map((b, i) => Math.max(needs[i], b * s));
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (sum(at(mid)) > budget) hi = mid;
    else lo = mid;
  }
  return at(lo);
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
    setW(spacing, "line", String(lineTw(sizeHalfPt))); // 고정 줄 간격이라 높이 어림과 실제 높이가 같음
    setW(spacing, "lineRule", "exact");

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
  const styles = await readStyles(zip);
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
      const tcs = cells.filter((c) => c.g0 >= d0 && c.g1 <= d1).map((c) => c.tc);
      // 한 요일 칸이 여러 개로 나뉜 템플릿이어도 항상 한 칸으로 합쳐서 사용 (왼쪽 칸 색상 유지)
      if (tcs.length > 1) mergeCells(tcs[0], tcs);
      dayCells.set(d, tcs.slice(0, 1));
    }
    rows.push({ tr, period: +m[1], dayCells });
  }
  const budget = periodRowBudget(body, new Set(rows.map((r) => r.tr)), styles);
  /** 교시 이름 칸처럼 채우지 않는 칸에 필요한 높이 */
  const labelNeed = (tr: Element) => {
    const filled = new Set([...rows.find((r) => r.tr === tr)!.dayCells.values()].flat());
    return Math.max(0, ...kids(tr, "tc").filter((tc) => !filled.has(tc)).map((tc) => cellContentHeight(tc, styles)));
  };
  return { zip, xml, rows, budget, labelNeed };
}

async function saveDocx(zip: JSZip, xml: Document) {
  let out = new XMLSerializer().serializeToString(xml);
  if (!out.startsWith("<?xml")) out = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${out}`;
  zip.file("word/document.xml", out);
  return zip.generateAsync({ type: "blob", mimeType: DOCX_MIME, compression: "DEFLATE" });
}

/** 전체 특수학급 시간표: 각 칸에 [과목] / 학생 이름 */
export async function fillTemplate(templateBuf: ArrayBuffer, schedule: Schedule, settings?: TemplateSettings) {
  const { zip, xml, rows, budget, labelNeed } = await openTimetable(templateBuf, settings);

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

  // 2) 한 페이지에 들어가는 가장 큰 글씨 찾기 (같은 크기에서는 PACKINGS 순서로 촘촘하게)
  const bases = plan.map(({ tr }) => rowHeight(tr));
  const labels = plan.map(({ tr }) => labelNeed(tr));
  const configs = FONT_SIZES_HALF_PT.flatMap((size) => PACKINGS.map((packing) => ({ size, packing })));
  const needsFor = ({ size, packing }: { size: number; packing: Packing }) =>
    plan.map(({ items }, i) =>
      Math.max(
        labels[i],
        ...items.map(({ tc, groups }) => linesHeight(groupLines(groups, size, contentWidth(tc), packing), size, contentWidth(tc))),
      ),
    );
  let chosen = configs.find((c) => sum(needsFor(c)) <= budget);
  if (!chosen) {
    chosen = configs[configs.length - 1];
    notes.push(`학생이 아주 많아 가장 작은 글씨(${chosen.size / 2}pt)로도 한 페이지를 넘을 수 있습니다.`);
  } else if (chosen.size < FONT_SIZES_HALF_PT[0]) {
    notes.push(`한 페이지에 맞추려고 이름 글씨를 ${chosen.size / 2}pt로 줄였어요.`);
  }
  const { size, packing } = chosen;

  // 3) 채우기
  for (const { items } of plan) {
    for (const { tc, groups } of items) writeCell(tc, groupLines(groups, size, contentWidth(tc), packing), size);
  }

  // 4) 행 높이: 한 페이지 안에서 양식의 높이 비율대로
  const heights = layoutRows(bases, needsFor(chosen), budget);
  plan.forEach(({ tr }, i) => setRowHeight(tr, heights[i]));

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
 * 한 페이지를 넘을 것 같으면 과목명 글씨와 행 높이를 줄여 항상 한 페이지에 맞춤.
 * 나뉜 칸은 하나로 합치되, 전체 시간표에서 그 학생의 과목이 놓인 칸의 색상을 따름.
 */
export async function fillStudentTemplate(
  templateBuf: ArrayBuffer,
  schedule: Schedule,
  slots: Map<string, string>,
  settings?: TemplateSettings,
) {
  const { zip, xml, rows, budget, labelNeed } = await openTimetable(templateBuf, settings);
  const plan = rows.map(({ tr, period, dayCells: byDay }) => {
    const cells: { tc: Element; subject: string }[] = [];
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
      if (subject) cells.push({ tc: target, subject });
    }
    return { tr, cells, label: labelNeed(tr) };
  });

  // 한 페이지에 들어가고 과목명이 칸 안에서 줄바뀜 없이 들어가는 가장 큰 글씨
  const needsFor = (size: number) =>
    plan.map(({ cells, label }) =>
      Math.max(label, ...cells.map(({ tc, subject }) => linesHeight([{ text: subject }], size, contentWidth(tc)))),
    );
  const fits = (size: number) => sum(needsFor(size)) <= budget;
  const oneLine = (size: number) =>
    plan.every(({ cells }) => cells.every(({ tc, subject }) => wrapCount(subject, size, contentWidth(tc)) === 1));
  const sizes = PERSONAL_FONT_SIZES_HALF_PT;
  const size = sizes.find((s) => fits(s) && oneLine(s)) ?? sizes.find(fits) ?? sizes[sizes.length - 1];

  for (const { cells } of plan) for (const { tc, subject } of cells) writeCell(tc, [{ text: subject }], size);
  const heights = layoutRows(
    plan.map(({ tr }) => rowHeight(tr)),
    needsFor(size),
    budget,
  );
  plan.forEach(({ tr }, i) => setRowHeight(tr, heights[i]));
  return saveDocx(zip, xml);
}

/** 같은 양식으로 만든 문서 여러 개를 한 파일로 합침. 문서마다 새 쪽에서 시작 (구역 나누기) */
export async function combineDocx(blobs: Blob[]) {
  const [first, ...rest] = await Promise.all(blobs.map(async (b) => openDocx(await b.arrayBuffer())));
  const { zip, xml, body } = first;
  const sectPr = kid(body, "sectPr");
  for (const next of rest) {
    // 지금까지의 마지막 문단에서 구역을 끝내면 빈 줄 없이 다음 쪽부터 시작
    let last = Array.from(body.childNodes)
      .filter((n): n is Element => n.nodeType === 1 && n !== sectPr)
      .pop();
    if (!last || last.localName !== "p") {
      last = mk(xml, "p");
      body.insertBefore(last, sectPr);
    }
    if (sectPr) {
      const pPr = kid(last, "pPr") ?? last.insertBefore(mk(xml, "pPr"), last.firstChild);
      insertBefore(pPr, sectPr.cloneNode(true) as Element, ["pPrChange"]);
    }
    for (const node of Array.from(next.body.childNodes)) {
      if (node.nodeType === 1 && (node as Element).localName === "sectPr") continue;
      body.insertBefore(xml.importNode(node, true), sectPr);
    }
  }
  return saveDocx(zip, xml);
}
