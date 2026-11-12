/**
 * 특수교육실무사 활동일지: 올려 준 양식(월~금 × 9개 지원 내용, 체크 칸, 요일별 비고)과 같은 구성으로 코드로 그립니다.
 * A4 세로 한 장(595 × 842 단위). 화면에서는 빈 양식 위에 입력칸을 겹쳐 놓고, PDF 에는 입력한 내용까지 그려 넣습니다.
 */
import { esc } from "./svgExport";

export const LOG_W = 595;
export const LOG_H = 842;

export const WRITER = "박옥순";
export const DAYS = ["월", "화", "수", "목", "금"] as const;
export const ITEMS = [
  "등교",
  "교수학습 활동",
  "이동수업 지원",
  "신변처리",
  "급식",
  "교내외 활동(행사, 수련회, 현장체험 등)",
  "교재교구 제작 및 정리",
  "학급 환경 개선",
  "하교",
] as const;
export const NOTE_MAX = 80;

/** 인쇄된 글자와 손으로 쓴 듯한 글자 (글꼴 이름은 Google Fonts 와 같음) */
export const PRINT_FAMILY = "Gowun Dodum";
export const INK_FAMILY = "Nanum Pen Script";
export const PRINT_FONT = `"${PRINT_FAMILY}","Malgun Gothic","맑은 고딕",sans-serif`;
export const INK_FONT = `"${INK_FAMILY}","${PRINT_FAMILY}","Malgun Gothic",cursive`;
export const LOG_FONTS_URL = `https://fonts.googleapis.com/css2?family=${PRINT_FAMILY.replace(/ /g, "+")}&family=${INK_FAMILY.replace(/ /g, "+")}&display=swap`;

const INK = "#1f2a44";
const LINE = "#222";

export type DutyLog = {
  /** YYYY-MM-DD (비어 있을 수 있음) */
  start: string;
  end: string;
  /** 요일 × 항목 순서 (월요일 9개, 화요일 9개 …)로 체크했는지 */
  checks: boolean[];
  /** 요일별 비고 */
  notes: string[];
  /** 작성자 서명을 넣었는지 */
  signed: boolean;
};

export const ROWS_PER_DAY = ITEMS.length;
export const emptyLog = (start = "", end = ""): DutyLog => ({
  start,
  end,
  checks: Array(DAYS.length * ROWS_PER_DAY).fill(false),
  notes: Array(DAYS.length).fill(""),
  signed: false,
});

/** Date → YYYY-MM-DD (이 컴퓨터의 시간대 기준) */
export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
/** 그 날짜에서 n일 뒤 */
export const addDays = (iso: string, n: number) => {
  const d = parseIso(iso);
  return isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
/** 그 날짜가 속한 주의 월요일 (일요일은 그 전 주) — 활동일지는 이 날짜를 열쇠로 주마다 한 장 */
export const mondayOf = (iso: string) => addDays(iso, -((parseIso(iso).getDay() + 6) % 7));
/** 그 주(월요일 날짜)의 빈 활동일지: 월요일 ~ 금요일 */
export const weekLog = (monday: string) => emptyLog(monday, addDays(monday, 4));
/**
 * 활동일지가 다루는 날짜: 양식에 적은 시작일 ~ 끝날짜. 적지 않았으면 그 주 월~금 (한 장이 한 달 넘게 이어지지 않도록 31일까지만).
 * 달력에서 활동일지를 보여 줄 날짜와 목록의 기간이 모두 이것을 따름
 */
export function logRange(key: string, log: DutyLog): { start: string; end: string } {
  const ok = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const start = ok(log.start) ? log.start : key;
  let end = ok(log.end) ? log.end : ok(log.start) ? log.start : addDays(key, 4);
  if (end < start) end = start;
  if (end > addDays(start, 30)) end = addDays(start, 30);
  return { start, end };
}

/**
 * 주별 기록의 열쇠는 늘 그 주 월요일 날짜. 월요일이 아닌 날짜로 저장돼 있던 기록(예전에 시작일을 열쇠로 쓴 것)은
 * 그 주 월요일 열쇠로 합치고, 같은 주에 둘이 있으면 나중에 고친 쪽만 남김
 */
export function canonicalWeeks<T extends { updatedAt: number }>(weeks: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, doc] of Object.entries(weeks)) {
    const monday = mondayOf(key);
    if (!out[monday] || doc.updatedAt > out[monday].updatedAt) out[monday] = doc;
  }
  return out;
}

/** 쓴 내용이 있는지 (체크 · 비고 · 서명) */
export const hasEntries = (log: DutyLog) => log.signed || log.checks.some(Boolean) || log.notes.some((n) => n.trim());

/** 양식의 칸 위치 */
export const GRID = {
  /** 세로선: 바깥 왼쪽 · 요일 앞 · 지원 내용 앞 · 체크 앞 · 비고 앞 · 바깥 오른쪽 */
  x: [91, 129, 158, 405, 444, 552],
  top: 182,
  headH: 14,
  rowH: 13,
};
export const bodyTop = GRID.top + GRID.headH;
export const dayH = ROWS_PER_DAY * GRID.rowH;
export const bodyBottom = bodyTop + DAYS.length * dayH;
export const dayTop = (d: number) => bodyTop + d * dayH;
export const rowTop = (d: number, i: number) => dayTop(d) + i * GRID.rowH;

/** 날짜 줄과 작성자 줄 */
export const DATE_LINE = { y: 176, startX: 91, endX: 203, w: 92, /** 달력 단추가 차지하는 오른쪽 자리 */ icon: 12 };
export const SIGN_BOX = { x: 424, y: 158, w: 128, h: 22 };
export const NOTE_FONT = 11;
export const NOTE_LINE = 13;
export const noteBox = (d: number) => ({ x: GRID.x[4] + 3, y: dayTop(d) + 4, w: GRID.x[5] - GRID.x[4] - 6, h: dayH - 8 });

/** YYYY-MM-DD → 2026. 11. 9. (비어 있으면 손으로 쓰도록 빈칸) */
export const formatDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : "";
};

/** 시작일이 속한 학년도 (3월에 시작) */
export const schoolYear = (iso: string, fallback = new Date()) => {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  const [y, mo] = m ? [Number(m[1]), Number(m[2])] : [fallback.getFullYear(), fallback.getMonth() + 1];
  return mo >= 3 ? y : y - 1;
};

export const headerText = (log: DutyLog) => `${schoolYear(log.start)}학년도 월계중학교 특수교육실무사 활동일지`;

/** 체크 표시: 칸 가운데에 손으로 그은 듯한 ✓ (칸마다 조금씩 다르게) */
export const checkPath = (index: number) => {
  const cx = (GRID.x[3] + GRID.x[4]) / 2;
  const j = (((index * 7) % 5) - 2) * 0.45;
  return `M${cx - 6 + j} ${-0.5 + j} L${cx - 2.4} ${4.2} L${cx + 6.5 - j} ${-5.2}`;
};
export const checkCenterY = (d: number, i: number) => rowTop(d, i) + GRID.rowH / 2;

/** 글자 너비를 어림해 칸 너비에 맞게 줄을 나눔 (한글은 글자 크기만큼, 숫자 · 영문은 절반 남짓) */
export function wrapNote(text: string, width: number, fs = NOTE_FONT) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    let w = 0;
    for (const ch of para) {
      const cw = (ch.charCodeAt(0) > 255 ? 1 : 0.5) * fs;
      if (w + cw > width && line) {
        lines.push(line);
        line = "";
        w = 0;
      }
      line += ch;
      w += cw;
    }
    lines.push(line);
  }
  return lines;
}

const svgOpen = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOG_W} ${LOG_H}" width="${LOG_W}" height="${LOG_H}" font-family='${PRINT_FONT}'>`;

/** 양식. withEntries 면 입력한 내용(날짜 · 체크 · 비고 · 서명)까지 그리고, 아니면 빈 양식(화면에서는 입력칸을 겹쳐 놓음) */
export function dutyLogSvg(log: DutyLog, withEntries = false) {
  const { x, top, headH, rowH } = GRID;
  const [x0, x1, x2, x3, x4, x5] = x;
  const out: string[] = [];

  out.push(`<rect width="${LOG_W}" height="${LOG_H}" fill="#fff"/>`);
  out.push(`<text x="${x0}" y="104" font-size="8.5" fill="${LINE}">${esc(headerText(log))}</text>`);
  out.push(`<text x="${LOG_W / 2}" y="142" text-anchor="middle" font-size="23" fill="${LINE}" stroke="${LINE}" stroke-width="0.5">특수교육실무사 활동일지</text>`);
  out.push(`<text x="${(DATE_LINE.startX + DATE_LINE.w + DATE_LINE.endX) / 2}" y="${DATE_LINE.y}" text-anchor="middle" font-size="12" fill="${LINE}">~</text>`);
  out.push(`<text x="${SIGN_BOX.x}" y="${DATE_LINE.y}" font-size="10.5" fill="${LINE}">작성자:</text>`);
  out.push(`<text x="${x5}" y="${DATE_LINE.y}" text-anchor="end" font-size="10.5" fill="${LINE}">(인)</text>`);

  // 표 머리글
  out.push(`<rect x="${x0}" y="${top}" width="${x5 - x0}" height="${headH}" fill="#e6e6e6"/>`);
  out.push(`<line x1="${x0}" y1="${top}" x2="${x2}" y2="${top + headH}" stroke="#777" stroke-width="0.6"/>`);
  out.push(`<text x="${(x2 + x4) / 2}" y="${top + headH / 2 + 4}" text-anchor="middle" font-size="10.5" fill="${LINE}">지원 내용</text>`);
  out.push(`<text x="${(x4 + x5) / 2}" y="${top + headH / 2 + 4}" text-anchor="middle" font-size="10.5" fill="${LINE}">비고</text>`);

  // 가로선: 항목마다 얇게(지원 내용 · 체크 칸), 요일 사이는 굵게(요일 · 지원 내용 · 체크 · 비고)
  for (let d = 0; d < DAYS.length; d++) {
    for (let i = 1; i < ROWS_PER_DAY; i++) {
      const y = rowTop(d, i);
      out.push(`<line x1="${x2}" y1="${y}" x2="${x4}" y2="${y}" stroke="${LINE}" stroke-width="0.6"/>`);
    }
    if (d > 0) out.push(`<line x1="${x1}" y1="${dayTop(d)}" x2="${x5}" y2="${dayTop(d)}" stroke="${LINE}" stroke-width="1.1"/>`);
  }
  out.push(`<line x1="${x0}" y1="${bodyTop}" x2="${x5}" y2="${bodyTop}" stroke="${LINE}" stroke-width="1.1"/>`);
  // 세로선
  for (const vx of [x1, x2, x4]) out.push(`<line x1="${vx}" y1="${top}" x2="${vx}" y2="${bodyBottom}" stroke="${LINE}" stroke-width="1.1"/>`);
  out.push(`<line x1="${x3}" y1="${bodyTop}" x2="${x3}" y2="${bodyBottom}" stroke="${LINE}" stroke-width="0.6"/>`);
  out.push(`<rect x="${x0}" y="${top}" width="${x5 - x0}" height="${bodyBottom - top}" fill="none" stroke="${LINE}" stroke-width="1.4"/>`);

  // 활 동 내 용 (세로로)
  [..."활동내용"].forEach((c, i) => {
    out.push(`<text x="${(x0 + x1) / 2}" y="${(bodyTop + bodyBottom) / 2 + (i - 1.5) * 26 + 4}" text-anchor="middle" font-size="11" fill="${LINE}">${c}</text>`);
  });
  // 요일 · 항목
  for (let d = 0; d < DAYS.length; d++) {
    out.push(`<text x="${(x1 + x2) / 2}" y="${dayTop(d) + dayH / 2 + 4.5}" text-anchor="middle" font-size="12" fill="${LINE}">${DAYS[d]}</text>`);
    ITEMS.forEach((item, i) => {
      out.push(`<text x="${x2 + 4}" y="${rowTop(d, i) + rowH / 2 + 3.3}" font-size="9.2" fill="${LINE}">- ${esc(item)}</text>`);
    });
  }

  if (withEntries) {
    const ink = `font-family='${INK_FONT}' fill="${INK}"`;
    const a = formatDate(log.start);
    const b = formatDate(log.end);
    if (a) out.push(`<text x="${DATE_LINE.startX + (DATE_LINE.w - DATE_LINE.icon) / 2}" y="${DATE_LINE.y}" text-anchor="middle" font-size="14" ${ink}>${esc(a)}</text>`);
    if (b) out.push(`<text x="${DATE_LINE.endX + (DATE_LINE.w - DATE_LINE.icon) / 2}" y="${DATE_LINE.y}" text-anchor="middle" font-size="14" ${ink}>${esc(b)}</text>`);
    log.checks.forEach((on, k) => {
      if (!on) return;
      const d = Math.floor(k / ROWS_PER_DAY);
      const i = k % ROWS_PER_DAY;
      out.push(`<path d="${checkPath(k)}" transform="translate(0 ${checkCenterY(d, i)})" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`);
    });
    log.notes.forEach((note, d) => {
      const box = noteBox(d);
      wrapNote(note, box.w).forEach((line, li) => {
        out.push(`<text x="${box.x + box.w / 2}" y="${box.y + NOTE_FONT + li * NOTE_LINE - 1}" text-anchor="middle" font-size="${NOTE_FONT + 1}" ${ink}>${esc(line)}</text>`);
      });
    });
    if (log.signed) out.push(`<text x="${SIGN_BOX.x + 52}" y="${DATE_LINE.y + 1}" font-size="17" ${ink}>${WRITER}</text>`);
  }
  return `${svgOpen()}${out.join("")}</svg>`;
}

/** PDF 글꼴을 내려받을 때 필요한 글자 */
export const dutyLogText = (log: DutyLog) => ({
  print: `${headerText(log)}특수교육실무사활동일지20~작성자:(인)지원내용비고활동내용${DAYS.join("")}${ITEMS.join("")}-`,
  ink: `${formatDate(log.start)}${formatDate(log.end)}${log.notes.join("")}${WRITER}`,
});
