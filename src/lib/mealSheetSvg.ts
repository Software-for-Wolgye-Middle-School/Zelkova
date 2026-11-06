import type { MealCell, MealItem, MealTable } from "./meal";
import { esc } from "./svgExport";

/**
 * 식단표 한 달치를 A4 세로 한 장 SVG 로 그림 (PDF 저장용).
 * 내용이 많든 적든 항상 한 장을 꽉 채움: 들어가는 가장 큰 글씨 배율을 찾고, 남는 높이는 주마다 식단 칸에 나눠 줌.
 */

export const SHEET_W = 794;
export const SHEET_H = 1123;
export const SHEET_FONT_FAMILY = "Noto Sans KR";

const FONT = `'${SHEET_FONT_FAMILY}', "Malgun Gothic", "맑은 고딕", sans-serif`;
const MARGIN = 34;
const CELL_PAD = 7;
const BORDER = "#94a3b8";
/** 글씨 · 칸 크기 배율의 범위 (1 = 기본 크기). 내용이 적으면 키우고 많으면 줄임 */
const MIN_SCALE = 0.4;
const MAX_SCALE = 1.5;

/** 배율 f 일 때의 글씨 크기 · 줄 높이 · 칸 높이 */
function dims(f: number) {
  return {
    name: { size: 13 * f, line: 18 * f },
    allergen: { size: 8.5 * f, line: 12 * f },
    note: { size: 10.5 * f, line: 15 * f },
    title: { size: 24 * f, h: 56 * f },
    head: { size: 14 * f, h: 34 * f },
    date: { size: 13 * f, noteSize: 9.5 * f, h: 24 * f },
    nutrition: { size: 10 * f, h: 20 * f },
    rowPad: 16 * f,
    minMenu: 40 * f,
  };
}
type Dims = ReturnType<typeof dims>;

/** 글꼴을 쓰지 못할 때도 넘치지 않도록 넉넉하게 어림한 글자 폭 */
const charWidth = (ch: string, size: number) => (ch.charCodeAt(0) < 0x2e80 ? 0.6 : 1) * size;
const textWidth = (s: string, size: number) => [...s].reduce((w, ch) => w + charWidth(ch, size), 0);

function wrap(tokens: string[], size: number, maxWidth: number) {
  const lines: string[] = [];
  let cur = "";
  for (const token of tokens) {
    if (cur && textWidth(cur + token, size) > maxWidth) {
      lines.push(cur);
      cur = "";
    }
    cur += token;
  }
  if (cur) lines.push(cur);
  return lines;
}
const wrapChars = (s: string, size: number, maxWidth: number) => wrap([...s], size, maxWidth);
/** 알레르기 번호는 숫자 중간에서 끊지 않음 */
const wrapAllergens = (s: string, size: number, maxWidth: number) => wrap(s.match(/[^.]+\.?/g) ?? [], size, maxWidth);

type Line = { name: string; allergens: string; height: number };

function itemLines(item: MealItem, width: number, d: Dims): Line[] {
  const lines: Line[] = wrapChars(item.name, d.name.size, width).map((name) => ({ name, allergens: "", height: d.name.line }));
  const allergens = item.allergens ? wrapAllergens(item.allergens, d.allergen.size, width) : [];
  const last = lines[lines.length - 1];
  // 음식 이름 옆에 들어가면 같은 줄에 작게 씀
  if (last && allergens.length === 1 && textWidth(last.name, d.name.size) + 3 + textWidth(allergens[0], d.allergen.size) <= width) {
    last.allergens = allergens[0];
  } else {
    for (const a of allergens) lines.push({ name: "", allergens: a, height: d.allergen.line });
  }
  return lines;
}

/** 안내 칸의 줄들 (낱말 중간에서 끊지 않음) */
const noteLines = (cell: Extract<MealCell, { kind: "note" }>, width: number, d: Dims) =>
  cell.lines.flatMap((l) => wrap(l.match(/\S+\s*/g) ?? [], d.note.size, width));
const dayLines = (cell: Extract<MealCell, { kind: "day" }>, width: number, d: Dims) => cell.items.flatMap((item) => itemLines(item, width, d));

const cellHeight = (cell: MealCell, width: number, d: Dims) =>
  cell.kind === "note" ? noteLines(cell, width, d).length * d.note.line : dayLines(cell, width, d).reduce((h, l) => h + l.height, 0);

export function mealSheetSvg(table: MealTable, fallbackTitle: string) {
  const cols = Math.max(table.weekdays.length, ...table.weeks.flatMap((w) => w.cells.map((c) => c.col + (c.kind === "note" ? c.span : 1) - 1)), 1);
  const tableW = SHEET_W - MARGIN * 2;
  const colW = tableW / cols;
  const spanOf = (cell: MealCell) => (cell.kind === "note" ? cell.span : 1);
  const innerW = (cell: MealCell) => colW * spanOf(cell) - CELL_PAD * 2;

  const available = SHEET_H - MARGIN * 2;
  const measure = (f: number) => {
    const d = dims(f);
    const menuHeights = table.weeks.map((w) => Math.max(d.minMenu, ...w.cells.map((c) => cellHeight(c, innerW(c), d))) + d.rowPad);
    const chrome = (i: number) => d.date.h + (table.weeks[i].nutrition ? d.nutrition.h : 0);
    const content = d.title.h + d.head.h + menuHeights.reduce((sum, h, i) => sum + h + chrome(i), 0);
    return { d, menuHeights, content };
  };
  // 한 장에 들어가는 가장 큰 배율 (글씨가 커지면 줄바꿈이 늘어 높이도 늘어나므로 차례로 좁혀 감)
  let lo = MIN_SCALE;
  let hi = MAX_SCALE;
  if (measure(hi).content <= available) lo = hi;
  else
    for (let k = 0; k < 25; k++) {
      const mid = (lo + hi) / 2;
      if (measure(mid).content <= available) lo = mid;
      else hi = mid;
    }
  const { d, menuHeights, content } = measure(lo);
  // 가장 작은 글씨로도 넘치는 경우에만 전체를 줄임
  const scale = Math.min(1, available / content);
  // 남는 높이는 주마다 식단 칸에 똑같이 나눠 표가 쪽 아래 여백까지 꽉 차게 함
  const extra = table.weeks.length ? Math.max(0, available - content) / table.weeks.length : 0;

  const parts: string[] = [];
  const rect = (x: number, y: number, w: number, h: number, fill = "#fff") =>
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${BORDER}" stroke-width="0.8"/>`);
  const text = (x: number, y: number, body: string, size: number, attrs = "") =>
    parts.push(`<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" ${attrs}>${body}</text>`);

  // 글씨 세로 위치는 칸 높이에 맞춰 가운데쯤 (기본 크기 기준 비율)
  text(tableW / 2, d.title.h * (34 / 56), esc(table.title || fallbackTitle), d.title.size, `font-weight="700" fill="#0f172a"`);

  let y = d.title.h;
  for (let c = 0; c < cols; c++) {
    rect(c * colW, y, colW, d.head.h, "#e2e8f0");
    text((c + 0.5) * colW, y + d.head.h * (22 / 34), esc(table.weekdays[c] ?? ""), d.head.size, `font-weight="700" fill="#0f172a"`);
  }
  y += d.head.h;

  table.weeks.forEach((week, i) => {
    const menuH = menuHeights[i] + extra;
    for (let c = 0; c < cols; c++) {
      rect(c * colW, y, colW, d.date.h, "#f1f5f9");
      rect(c * colW, y + d.date.h, colW, menuH);
    }
    for (const cell of week.cells) {
      const x = (cell.col - 1) * colW;
      const w = colW * spanOf(cell);
      const cx = x + w / 2;
      const top = y + d.date.h;
      if (cell.kind === "note") {
        // 여러 칸을 합친 칸: 칸 사이 선을 덮고 글을 씀
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${d.date.h + menuH}" fill="#fff" stroke="${BORDER}" stroke-width="0.8"/>`);
        const lines = noteLines(cell, innerW(cell), d);
        let ly = y + (d.date.h + menuH - lines.length * d.note.line) / 2 + d.note.size;
        for (const line of lines) {
          text(cx, ly, esc(line), d.note.size, `fill="#334155"${line.startsWith("◆") ? ` font-weight="700"` : ""}`);
          ly += d.note.line;
        }
        continue;
      }
      const date = esc(cell.date) + (cell.dateNote ? `<tspan font-size="${d.date.noteSize}" dx="4">${esc(cell.dateNote)}</tspan>` : "");
      text(cx, y + d.date.h * (17 / 24), date, d.date.size, `font-weight="700" fill="#0f172a"`);
      const lines = dayLines(cell, innerW(cell), d);
      const noMeal = cell.items.length <= 1 && !cell.items[0]?.allergens;
      let ly = top + (menuH - lines.reduce((h, l) => h + l.height, 0)) / 2;
      for (const line of lines) {
        const body = [
          line.name && esc(line.name),
          line.allergens && `<tspan font-size="${d.allergen.size}" fill="#64748b"${line.name ? ` dx="3"` : ""}>${esc(line.allergens)}</tspan>`,
        ]
          .filter(Boolean)
          .join("");
        text(cx, ly + line.height * (13 / 18), body, d.name.size, noMeal ? `font-weight="700" fill="#64748b"` : `fill="#0f172a"`);
        ly += line.height;
      }
    }
    y += d.date.h + menuH;
    if (week.nutrition) {
      rect(0, y, tableW, d.nutrition.h, "#f8fafc");
      text(tableW / 2, y + d.nutrition.h * (14 / 20), esc(`영양량 · ${week.nutrition}`), d.nutrition.size, `fill="#475569"`);
      y += d.nutrition.h;
    }
  });

  const offsetX = MARGIN + (tableW - tableW * scale) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}" font-family="${esc(FONT)}">` +
    `<rect width="${SHEET_W}" height="${SHEET_H}" fill="#fff"/>` +
    `<g transform="translate(${offsetX} ${MARGIN}) scale(${scale})">${parts.join("")}</g></svg>`
  );
}

/** 글꼴에 담을 글자 모음 */
export function mealSheetText(table: MealTable, fallbackTitle: string) {
  const cellText = (c: MealCell) => (c.kind === "note" ? c.lines.join("") : c.date + c.dateNote + c.items.map((i) => i.name + i.allergens).join(""));
  return `영양량·${table.title || fallbackTitle}${table.weekdays.join("")}${table.weeks.map((w) => w.nutrition + w.cells.map(cellText).join("")).join("")}`;
}
