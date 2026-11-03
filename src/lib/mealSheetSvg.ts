import type { MealCell, MealItem, MealTable } from "./meal";
import { esc } from "./svgExport";

/** 식단표 한 달치를 A4 세로 한 장 SVG 로 그림 (PDF 저장용). */

export const SHEET_W = 794;
export const SHEET_H = 1123;
export const SHEET_FONT_FAMILY = "Noto Sans KR";

const FONT = `'${SHEET_FONT_FAMILY}', "Malgun Gothic", "맑은 고딕", sans-serif`;
const MARGIN = 34;
const CELL_PAD = 7;
const NAME = { size: 13, line: 18 };
const ALLERGEN = { size: 8.5, line: 12 };
const NOTE = { size: 10.5, line: 15 };
const TITLE_H = 56;
const HEAD_H = 34;
const DATE_H = 24;
const NUTRITION_H = 20;
const ROW_PAD = 16;
/** 쪽이 남을 때 한 주의 식단 칸에 더 줄 수 있는 높이 */
const MAX_EXTRA = 34;
const BORDER = "#94a3b8";

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
const wrapAllergens = (s: string, maxWidth: number) => wrap(s.match(/[^.]+\.?/g) ?? [], ALLERGEN.size, maxWidth);

type Line = { name: string; allergens: string; height: number };

function itemLines(item: MealItem, width: number): Line[] {
  const lines: Line[] = wrapChars(item.name, NAME.size, width).map((name) => ({ name, allergens: "", height: NAME.line }));
  const allergens = item.allergens ? wrapAllergens(item.allergens, width) : [];
  const last = lines[lines.length - 1];
  // 음식 이름 옆에 들어가면 같은 줄에 작게 씀
  if (last && allergens.length === 1 && textWidth(last.name, NAME.size) + 3 + textWidth(allergens[0], ALLERGEN.size) <= width) {
    last.allergens = allergens[0];
  } else {
    for (const a of allergens) lines.push({ name: "", allergens: a, height: ALLERGEN.line });
  }
  return lines;
}

/** 식단 칸 안에 그릴 줄들 */
function cellLines(cell: MealCell, width: number) {
  // 안내 글은 낱말 중간에서 끊지 않음
  return cell.kind === "note"
    ? cell.lines.flatMap((l) => wrap(l.match(/\S+\s*/g) ?? [], NOTE.size, width))
    : cell.items.flatMap((item) => itemLines(item, width));
}

const cellHeight = (cell: MealCell, width: number) =>
  cell.kind === "note" ? cellLines(cell, width).length * NOTE.line : (cellLines(cell, width) as Line[]).reduce((h, l) => h + l.height, 0);

export function mealSheetSvg(table: MealTable, fallbackTitle: string) {
  const cols = Math.max(table.weekdays.length, ...table.weeks.flatMap((w) => w.cells.map((c) => c.col + (c.kind === "note" ? c.span : 1) - 1)), 1);
  const tableW = SHEET_W - MARGIN * 2;
  const colW = tableW / cols;
  const spanOf = (cell: MealCell) => (cell.kind === "note" ? cell.span : 1);
  const innerW = (cell: MealCell) => colW * spanOf(cell) - CELL_PAD * 2;

  const menuHeights = table.weeks.map((w) => Math.max(40, ...w.cells.map((c) => cellHeight(c, innerW(c)))) + ROW_PAD);
  const weekChrome = (i: number) => DATE_H + (table.weeks[i].nutrition ? NUTRITION_H : 0);
  const content = TITLE_H + HEAD_H + menuHeights.reduce((sum, h, i) => sum + h + weekChrome(i), 0);
  const available = SHEET_H - MARGIN * 2;
  const scale = Math.min(1, available / content);
  const extra = table.weeks.length ? Math.min(MAX_EXTRA, Math.max(0, available - content) / table.weeks.length) : 0;

  const parts: string[] = [];
  const rect = (x: number, y: number, w: number, h: number, fill = "#fff") =>
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${BORDER}" stroke-width="0.8"/>`);
  const text = (x: number, y: number, body: string, size: number, attrs = "") =>
    parts.push(`<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" ${attrs}>${body}</text>`);

  text(tableW / 2, 34, esc(table.title || fallbackTitle), 24, `font-weight="700" fill="#0f172a"`);

  let y = TITLE_H;
  for (let c = 0; c < cols; c++) {
    rect(c * colW, y, colW, HEAD_H, "#e2e8f0");
    text((c + 0.5) * colW, y + 22, esc(table.weekdays[c] ?? ""), 14, `font-weight="700" fill="#0f172a"`);
  }
  y += HEAD_H;

  table.weeks.forEach((week, i) => {
    const menuH = menuHeights[i] + extra;
    for (let c = 0; c < cols; c++) {
      rect(c * colW, y, colW, DATE_H, "#f1f5f9");
      rect(c * colW, y + DATE_H, colW, menuH);
    }
    for (const cell of week.cells) {
      const x = (cell.col - 1) * colW;
      const w = colW * spanOf(cell);
      const cx = x + w / 2;
      const top = y + DATE_H;
      if (cell.kind === "note") {
        // 여러 칸을 합친 칸: 칸 사이 선을 덮고 글을 씀
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${DATE_H + menuH}" fill="#fff" stroke="${BORDER}" stroke-width="0.8"/>`);
        const lines = cellLines(cell, innerW(cell)) as string[];
        let ly = y + (DATE_H + menuH - lines.length * NOTE.line) / 2 + NOTE.size;
        for (const line of lines) {
          text(cx, ly, esc(line), NOTE.size, `fill="#334155"${line.startsWith("◆") ? ` font-weight="700"` : ""}`);
          ly += NOTE.line;
        }
        continue;
      }
      const date = esc(cell.date) + (cell.dateNote ? `<tspan font-size="9.5" dx="4">${esc(cell.dateNote)}</tspan>` : "");
      text(cx, y + 17, date, 13, `font-weight="700" fill="#0f172a"`);
      const lines = cellLines(cell, innerW(cell)) as Line[];
      const noMeal = cell.items.length <= 1 && !cell.items[0]?.allergens;
      let ly = top + (menuH - lines.reduce((h, l) => h + l.height, 0)) / 2;
      for (const line of lines) {
        const body = [
          line.name && esc(line.name),
          line.allergens && `<tspan font-size="${ALLERGEN.size}" fill="#64748b"${line.name ? ` dx="3"` : ""}>${esc(line.allergens)}</tspan>`,
        ]
          .filter(Boolean)
          .join("");
        text(cx, ly + line.height - 5, body, NAME.size, noMeal ? `font-weight="700" fill="#64748b"` : `fill="#0f172a"`);
        ly += line.height;
      }
    }
    y += DATE_H + menuH;
    if (week.nutrition) {
      rect(0, y, tableW, NUTRITION_H, "#f8fafc");
      text(tableW / 2, y + 14, esc(`영양량 · ${week.nutrition}`), 10, `fill="#475569"`);
      y += NUTRITION_H;
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
