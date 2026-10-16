/**
 * 나와의 약속판을 SVG로 직접 그립니다 (무료 · 즉시 · 날짜와 이름이 항상 정확).
 * 올려 준 약속판과 같은 형식: 제목, 리본, 토끼 · 강아지, 요일별 색, 날짜 동그라미, 하단 '이 달의 약속' 칸.
 */
import { monthWeeks, WEEKDAYS, type PromiseBoardRequest } from "./promiseBoard";
import { embeddedFontCss, esc, FONT, printSheets, svgToPng } from "./svgExport";

export const BOARD_W = 860;
export const BOARD_H = 1216; // A4 세로 비율

const INK = "#4a2c2a";
const TITLE = "나와의 약속판";
const RIBBON = "작은 약속이 모여, 더 멋진 내가 돼요!";
const BUBBLE = ["나는 !!", "할 수 있어!"];
const BOTTOM = "이 달의 약속 작성 공간";

// 요일별 머리칸 배경 · 글자색, 날짜 동그라미 색 · 숫자색 (일 → 토)
const HEAD_FILL = ["#f6c6d1", "#fbe1e6", "#fbe1e6", "#fbe1e6", "#ecd9f2", "#fbe1e6", "#cfe3f6"];
const HEAD_TEXT = ["#d6455d", INK, INK, INK, INK, INK, "#2f6fb0"];
const DOT_FILL = ["#f8c8d3", "#fde8a4", "#cfe8c3", "#cde4f7", "#e5d2f0", "#f9d4c7", "#cde4f7"];
const DOT_TEXT = ["#d6455d", INK, INK, INK, INK, INK, "#2f6fb0"];
const TITLE_COLORS = ["#f7a6be", "#8fc8f2", "#c7a7ea", "#ffd56e", "#a6dba0", "#8fc8f2"];

/** 위쪽 가운데 (x, y) 에서 시작하는 크기 s 의 하트 */
function heart(x: number, y: number, s: number, fill: string, stroke = "") {
  const d = `M${x} ${y + s * 0.3} C${x} ${y} ${x - s * 0.5} ${y} ${x - s * 0.5} ${y + s * 0.3} C${x - s * 0.5} ${y + s * 0.6} ${x} ${y + s * 0.8} ${x} ${y + s} C${x} ${y + s * 0.8} ${x + s * 0.5} ${y + s * 0.6} ${x + s * 0.5} ${y + s * 0.3} C${x + s * 0.5} ${y} ${x} ${y} ${x} ${y + s * 0.3}Z`;
  return `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"` : ""}/>`;
}

/** 네 갈래 반짝이 */
function sparkle(x: number, y: number, s: number, fill = "#ffd25e") {
  return `<path d="M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z" fill="${fill}"/>`;
}

function bunny() {
  return `<g transform="translate(58 34)" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="40" cy="30" rx="14" ry="34" transform="rotate(-14 40 30)" fill="#fff"/>
    <ellipse cx="40" cy="32" rx="6" ry="22" transform="rotate(-14 40 32)" fill="#f9c6d2" stroke="none"/>
    <ellipse cx="78" cy="26" rx="14" ry="34" transform="rotate(12 78 26)" fill="#fff"/>
    <ellipse cx="78" cy="28" rx="6" ry="22" transform="rotate(12 78 28)" fill="#f9c6d2" stroke="none"/>
    <ellipse cx="60" cy="88" rx="50" ry="40" fill="#fff"/>
    <path d="M30 80 l10 6 l-10 6" fill="none"/>
    <path d="M70 84 q7 -8 14 0" fill="none"/>
    <ellipse cx="32" cy="100" rx="9" ry="5.5" fill="#f9b6c6" stroke="none"/>
    <ellipse cx="88" cy="100" rx="9" ry="5.5" fill="#f9b6c6" stroke="none"/>
    <path d="M54 98 q4 5 8 0" fill="none"/>
  </g>
  <g transform="rotate(-10 150 118)">${heart(150, 92, 52, "#e8434f", INK)}</g>
  <ellipse cx="128" cy="128" rx="12" ry="9" fill="#fff" stroke="${INK}" stroke-width="3"/>
  ${heart(196, 74, 16, "#f37c93")}
  ${heart(186, 112, 11, "#f7a0b2")}
  <g stroke="#f4c542" stroke-width="3.5" stroke-linecap="round">
    <path d="M40 90 l-14 -6"/><path d="M38 108 l-16 2"/><path d="M44 72 l-10 -12"/>
  </g>`;
}

function puppy() {
  return `<g stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="740" cy="60" rx="20" ry="34" transform="rotate(32 740 60)" fill="#e9b884"/>
    <ellipse cx="826" cy="60" rx="20" ry="34" transform="rotate(-32 826 60)" fill="#e9b884"/>
    <ellipse cx="783" cy="98" rx="50" ry="44" fill="#fbe5c8"/>
    <circle cx="764" cy="94" r="5" fill="${INK}" stroke="none"/>
    <circle cx="802" cy="94" r="5" fill="${INK}" stroke="none"/>
    <ellipse cx="783" cy="108" rx="7" ry="5" fill="${INK}" stroke="none"/>
    <path d="M776 116 q7 6 14 0" fill="none"/>
    <ellipse cx="750" cy="116" rx="9" ry="5.5" fill="#f9b6c6" stroke="none"/>
    <ellipse cx="816" cy="116" rx="9" ry="5.5" fill="#f9b6c6" stroke="none"/>
    <ellipse cx="752" cy="150" rx="16" ry="11" fill="#fbe5c8"/>
    <ellipse cx="814" cy="150" rx="16" ry="11" fill="#fbe5c8"/>
  </g>
  ${heart(838, 26, 18, "#f37c93")}
  <g stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" fill="#fff2a8">
    <path d="M694 118 L716 146 L708 116 Z"/>
    <ellipse cx="686" cy="90" rx="50" ry="36"/>
    <path d="M697 117 L711 136" stroke="#fff2a8" stroke-width="5"/>
  </g>
  <text x="686" y="${84}" text-anchor="middle" font-size="17" fill="${INK}" font-family='${FONT}'>${BUBBLE[0]}</text>
  <text x="686" y="${106}" text-anchor="middle" font-size="17" fill="${INK}" font-family='${FONT}'>${BUBBLE[1]}</text>
  ${heart(642, 118, 11, "#f37c93")}`;
}

export type BoardOptions = { fontCss?: string };

/** 약속판 SVG 문자열 (미리보기와 내려받기에 똑같이 사용) */
export function boardSvg({ name, year, month }: PromiseBoardRequest, opts: BoardOptions = {}) {
  const weeks = monthWeeks(year, month);
  const x0 = 36;
  const x1 = BOARD_W - 36;
  const colW = (x1 - x0) / 7;
  const top = 214;
  const headH = 56;
  const bottom = 1066;
  const rowH = (bottom - top - headH) / weeks.length;

  // 제목: 글자마다 다른 색, 진한 테두리
  let tx = 0;
  const titleSpans = [...TITLE]
    .map((ch) => {
      if (ch === " ") return `<tspan dx="4"> </tspan>`;
      return `<tspan fill="${TITLE_COLORS[tx++ % TITLE_COLORS.length]}">${ch}</tspan>`;
    })
    .join("");

  const headCells = WEEKDAYS.map((d, i) => {
    const x = x0 + i * colW;
    return `<rect x="${x}" y="${top}" width="${colW}" height="${headH}" fill="${HEAD_FILL[i]}"/>
      <text x="${x + colW / 2}" y="${top + headH / 2 + 10}" text-anchor="middle" font-size="28" fill="${HEAD_TEXT[i]}">${d}</text>`;
  }).join("");

  const dates = weeks
    .flatMap((week, w) =>
      week.map((d, i) => {
        if (d === null) return "";
        const cx = x0 + i * colW + 28;
        const cy = top + headH + w * rowH + 30;
        return `<circle cx="${cx}" cy="${cy}" r="19" fill="${DOT_FILL[i]}"/>
          <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="22" fill="${DOT_TEXT[i]}">${d}</text>`;
      }),
    )
    .join("");

  const gridV = Array.from({ length: 6 }, (_, i) => {
    const x = x0 + (i + 1) * colW;
    return `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}"/>`;
  }).join("");
  const gridH = [top + headH, ...Array.from({ length: weeks.length - 1 }, (_, i) => top + headH + (i + 1) * rowH)]
    .map((y) => `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`)
    .join("");

  const monthLabel = `${year}년 ${month}월`;
  const nameLabel = `이름: ${esc(name)}`;
  const pillW = (s: string) => Math.max(120, s.length * 19 + 44);
  const mW = pillW(monthLabel);
  const nW = pillW(`이름: ${name}`);
  const pillsX = BOARD_W / 2 - (mW + nW + 14) / 2;

  const rainbow = ["#f4a3a6", "#f8c690", "#f7e08a", "#b8dea1", "#a9d0f1", "#cbb4e8"]
    .map((c, i) => `<path d="M${688 + i * 7} 1172 a${50 - i * 7} ${50 - i * 7} 0 0 1 ${100 - i * 14} 0" fill="none" stroke="${c}" stroke-width="7.5"/>`)
    .join("");
  const cloud = (cx: number) => `<g stroke="${INK}" stroke-width="2.5" fill="#fff">
      <path d="M${cx - 30} 1188 a12 12 0 0 1 6 -22 a16 16 0 0 1 28 -6 a14 14 0 0 1 24 10 a11 11 0 0 1 2 18 z"/>
      <circle cx="${cx - 7}" cy="1176" r="2" fill="${INK}" stroke="none"/><circle cx="${cx + 7}" cy="1176" r="2" fill="${INK}" stroke="none"/>
      <path d="M${cx - 4} 1181 q4 4 8 0" fill="none" stroke-width="2"/></g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOARD_W} ${BOARD_H}" width="${BOARD_W}" height="${BOARD_H}" font-family='${FONT}'>
  ${opts.fontCss ? `<style>${opts.fontCss}</style>` : ""}
  <rect width="${BOARD_W}" height="${BOARD_H}" fill="#fff"/>
  ${bunny()}
  ${puppy()}
  <text x="${BOARD_W / 2 - 6}" y="104" text-anchor="middle" font-size="62" stroke="${INK}" stroke-width="6" stroke-linejoin="round" paint-order="stroke">${titleSpans}</text>
  <rect x="${BOARD_W / 2 - 190}" y="126" width="380" height="32" rx="16" fill="#fde2e8"/>
  ${heart(BOARD_W / 2 - 168, 135, 13, "#f0607c")}
  ${heart(BOARD_W / 2 + 168, 135, 13, "#f0607c")}
  <text x="${BOARD_W / 2}" y="149" text-anchor="middle" font-size="18" fill="#6b3f45">${RIBBON}</text>
  <rect x="${pillsX}" y="168" width="${mW}" height="34" rx="17" fill="#eaf4fe" stroke="#a7cdef" stroke-width="2"/>
  <text x="${pillsX + mW / 2}" y="192" text-anchor="middle" font-size="20" fill="#2f6fb0">${monthLabel}</text>
  <rect x="${pillsX + mW + 14}" y="168" width="${nW}" height="34" rx="17" fill="#fff0f4" stroke="#f3b3c3" stroke-width="2"/>
  <text x="${pillsX + mW + 14 + nW / 2}" y="192" text-anchor="middle" font-size="20" fill="#c2405c">${nameLabel}</text>

  <clipPath id="cal"><rect x="${x0}" y="${top}" width="${x1 - x0}" height="${bottom - top}" rx="16"/></clipPath>
  <g clip-path="url(#cal)">${headCells}</g>
  ${dates}
  <g stroke="${INK}" stroke-width="2.5">${gridV}${gridH}</g>
  <rect x="${x0}" y="${top}" width="${x1 - x0}" height="${bottom - top}" rx="16" fill="none" stroke="${INK}" stroke-width="3"/>

  <rect x="${x0}" y="1080" width="${x1 - x0}" height="118" rx="16" fill="#fff8e3" stroke="${INK}" stroke-width="3"/>
  <rect x="${x0 + 8}" y="1088" width="${x1 - x0 - 16}" height="102" rx="12" fill="#fffdf6"/>
  ${heart(66, 1098, 24, "#e8434f")}
  <g stroke="#dcc3a3" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round">
    <line x1="96" y1="1122" x2="640" y2="1122"/><line x1="70" y1="1152" x2="640" y2="1152"/>
  </g>
  ${heart(654, 1108, 16, "#f37c93")}
  ${rainbow}
  ${cloud(700)}${cloud(780)}
  ${sparkle(808, 1104, 9)}${sparkle(744, 1190, 6)}
  <text x="${BOARD_W / 2 - 40}" y="1186" text-anchor="middle" font-size="22" fill="${INK}">${BOTTOM}</text>
</svg>`;
}

// ---------------------------------------------------------------- 내려받기 · 인쇄 (브라우저 전용)

const boardText = (req: PromiseBoardRequest) =>
  [TITLE, RIBBON, ...BUBBLE, BOTTOM, WEEKDAYS.join(""), `${req.year}년 ${req.month}월`, `이름: ${req.name}`].join("");

/** A4 인쇄에 충분한 해상도의 PNG */
export async function boardPng(req: PromiseBoardRequest, scale = 2.5): Promise<Blob> {
  const svg = boardSvg(req, { fontCss: await embeddedFontCss(boardText(req)) });
  return svgToPng(svg, BOARD_W, BOARD_H, scale);
}

/** 새 창에서 A4 한 장으로 인쇄 */
export async function printBoard(req: PromiseBoardRequest, win: Window) {
  const svg = boardSvg(req, { fontCss: await embeddedFontCss(boardText(req)) });
  printSheets(win, {
    title: `${req.name} 나와의 약속판`,
    page: { w: 210, h: 297, css: "A4" },
    items: [svg],
    itemMm: { w: 210, h: 297 },
    cols: 1,
    rows: 1,
  });
}
