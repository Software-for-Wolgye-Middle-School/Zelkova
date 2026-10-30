/**
 * 칭찬통장: 올려 준 실물 통장과 같은 구성으로 코드로 그립니다.
 *  1) 표지 — 캐릭터 앞 그림 위에 이름표, 오른쪽 아래에 '칭찬 통장' 제목과 은행 이름
 *  2) 속지 — 말풍선 칸(이름 · 지점 · 계좌번호 · 구분 · 통장 발행일), 은행 이름과 도장, 서명 칸
 *  3) 거래 내역 — 날짜 | 내용 | 적립P | 차감P | 계 표
 *  4) 뒤표지 — 캐릭터 뒤 그림 (캐릭터가 없는 같은 배경)
 * 기본 크기는 A6 가로(148 × 105mm). 쪽 크기를 바꾸면 모든 쪽이 같은 크기로 A4 한 장에 들어가는 만큼 인쇄합니다.
 */
import { esc, FONT } from "./svgExport";

export const BOOK_W = 888;
export const BOOK_H = 630;
export const BOOK_MM = { w: 148, h: 105 };

const INK = "#3a3030";
export const TITLE = "칭찬 통장";

/** 속지 색 (템플릿은 노랑) */
export const PAPER_COLORS = {
  노랑: { fill: "#f8eba4", seal: "#d8343f" },
  분홍: { fill: "#fbd9e1", seal: "#d8343f" },
  하늘: { fill: "#d5eaf8", seal: "#d8343f" },
  연두: { fill: "#dff0c8", seal: "#d8343f" },
  보라: { fill: "#e4d6f4", seal: "#d8343f" },
  남색: { fill: "#c3cdea", seal: "#d8343f" },
} as const;
export type PaperColor = keyof typeof PAPER_COLORS;

export type Bankbook = {
  name: string;
  bank: string;
  branch: string;
  account: string;
  issued: string; // YYYY-MM-DD
  kind: "신규" | "재발급";
  paper: PaperColor;
  /** 표지 그림 (data: 주소) */
  cover: string;
  /** 뒤표지 그림 (data: 주소) */
  back: string;
};

const svgOpen = (w = BOOK_W, h = BOOK_H) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family='${FONT}'>`;

/** 바인더 링 구멍 자리 (위쪽 가장자리) */
const holes = () =>
  [0.27, 0.73]
    .map((p) => `<circle cx="${BOOK_W * p}" cy="30" r="11" fill="#fff" fill-opacity="0.85" stroke="#999" stroke-width="2"/>`)
    .join("");

/** 쪽 전체를 덮는 그림 */
const fullImage = (src: string) =>
  `<image href="${src}" xlink:href="${src}" x="0" y="0" width="${BOOK_W}" height="${BOOK_H}" preserveAspectRatio="xMidYMid slice"/>`;

function coverSvg(b: Bankbook) {
  const name = esc(b.name || "○○○");
  const pillW = Math.max(270, 170 + [...(b.name || "○○○")].length * 40);
  return `${svgOpen()}
  ${fullImage(b.cover)}
  <g transform="translate(44 520)">
    <rect width="${pillW}" height="72" rx="36" fill="#fff" fill-opacity="0.94" stroke="${INK}" stroke-opacity="0.15" stroke-width="2"/>
    <path d="M38 50 q-14 -22 6 -30 q6 16 -6 30z M38 50 q4 -24 24 -20 q-6 18 -24 20z" fill="#7cc36e"/>
    <text x="74" y="49" font-size="32" fill="${INK}">이름 : <tspan font-size="38">${name}</tspan></text>
  </g>
  <g text-anchor="end" fill="#fff" stroke="#3b2f63" stroke-linejoin="round" paint-order="stroke">
    <text x="${BOOK_W - 40}" y="${BOOK_H - 76}" font-size="40" stroke-width="8">${TITLE}</text>
    <text x="${BOOK_W - 40}" y="${BOOK_H - 36}" font-size="26" stroke-width="6">${esc(b.bank)}</text>
  </g>
  ${holes()}
</svg>`;
}

function infoSvg(b: Bankbook) {
  const paper = PAPER_COLORS[b.paper];
  const x0 = 54;
  const x1 = 540;
  const labelX = x0 + 36;
  const lineX = x0 + 200;
  const rows: [string, string][] = [
    ["이름", b.name],
    ["지점", b.branch],
    ["계좌번호", b.account],
    ["구분", ""],
    ["통장 발행일", b.issued.replace(/-/g, ". ")],
  ];
  const rowY = (i: number) => 140 + i * 58;
  const box = (x: number, y: number, checked: boolean) =>
    `<rect x="${x}" y="${y - 24}" width="26" height="26" fill="#fff" stroke="${INK}" stroke-width="3"/>` +
    (checked ? `<path d="M${x + 5} ${y - 12} l7 8 l13 -16" fill="none" stroke="#d8343f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : "");
  const lines = rows
    .map(([label, value], i) => {
      const y = rowY(i);
      const content =
        label === "구분"
          ? `<text x="${lineX + 6}" y="${y}" font-size="24" fill="${INK}">신규</text>${box(lineX + 62, y, b.kind === "신규")}
             <text x="${lineX + 120}" y="${y}" font-size="24" fill="${INK}">재발급</text>${box(lineX + 200, y, b.kind === "재발급")}`
          : `<text x="${lineX + 8}" y="${y - 4}" font-size="26" fill="#2f4f8f">${esc(value)}</text>
             <line x1="${lineX}" y1="${y + 8}" x2="${x1 - 30}" y2="${y + 8}" stroke="#555" stroke-width="2"/>`;
      return `<text x="${labelX}" y="${y}" font-size="28" fill="${INK}">${label}</text>${content}`;
    })
    .join("");

  // 말풍선: 둥근 사각형 + 왼쪽 위 꼬리
  const bubble = `<path d="M${x0} 58 L${x0 + 60} 96 L${x1 - 34} 96 Q${x1} 96 ${x1} 130 L${x1} 404 Q${x1} 438 ${x1 - 34} 438 L${x0 + 34} 438 Q${x0} 438 ${x0} 404 Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;

  const sx0 = 588;
  const sx1 = 846;
  const sign = `<rect x="${sx0}" y="96" width="${sx1 - sx0}" height="342" rx="${(sx1 - sx0) / 2}" fill="#fff" stroke="${INK}" stroke-width="4"/>
    <text x="${(sx0 + sx1) / 2}" y="160" text-anchor="middle" font-size="34" fill="${INK}">서명</text>
    <line x1="${sx0}" y1="184" x2="${sx1}" y2="184" stroke="${INK}" stroke-width="3"/>
    <text x="${(sx0 + sx1) / 2}" y="214" text-anchor="middle" font-size="14" fill="#555">본인임을 증명하는 서명을 적으세요.</text>
    <text x="${(sx0 + sx1) / 2}" y="234" text-anchor="middle" font-size="14" fill="#555">통장이 본인 소유임을 증명합니다.</text>`;

  const bankX = BOOK_W / 2 - 40;
  const seal = `<g transform="translate(${bankX + [...b.bank].length * 21 + 60} 540) rotate(-8)">
      <ellipse rx="44" ry="50" fill="${paper.seal}"/>
      <ellipse rx="36" ry="42" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="2"/>
      <text y="-4" text-anchor="middle" font-size="24" fill="#fff">담임</text>
      <text y="26" text-anchor="middle" font-size="24" fill="#fff">확인</text>
    </g>`;

  return `${svgOpen()}
  <rect width="${BOOK_W}" height="${BOOK_H}" fill="${paper.fill}"/>
  ${bubble}${lines}${sign}
  <text x="${bankX}" y="556" text-anchor="middle" font-size="42" fill="${INK}">${esc(b.bank)}</text>
  ${seal}
  ${holes()}
</svg>`;
}

/** 거래 내역 한 쪽 (10줄) */
function ledgerSvg() {
  const x0 = 40;
  const x1 = BOOK_W - 40;
  const top = 62;
  const bottom = BOOK_H - 28;
  const rows = 10;
  const headH = 54;
  const rowH = (bottom - top - headH) / rows;
  const cols: [string, number][] = [
    ["날짜", 0.16],
    ["내용", 0.42],
    ["적립P", 0.14],
    ["차감P", 0.14],
    ["계", 0.14],
  ];
  const w = x1 - x0;
  let x = x0;
  const xs = cols.map(([, r]) => {
    const start = x;
    x += r * w;
    return start;
  });
  const head = cols
    .map(([label, r], i) => `<text x="${xs[i] + (r * w) / 2}" y="${top + headH / 2 + 10}" text-anchor="middle" font-size="26" fill="${INK}">${label}</text>`)
    .join("");
  const vLines = xs
    .slice(1)
    .map((vx) => `<line x1="${vx}" y1="${top}" x2="${vx}" y2="${bottom}"/>`)
    .join("");
  const hLines = Array.from({ length: rows }, (_, i) => top + headH + i * rowH)
    .map((y) => `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`)
    .join("");
  return `${svgOpen()}
  <rect width="${BOOK_W}" height="${BOOK_H}" fill="#fff"/>
  <rect x="${x0}" y="${top}" width="${w}" height="${headH}" fill="#efecd6"/>
  ${head}
  <g stroke="${INK}" stroke-width="2.5">${vLines}${hLines}</g>
  <rect x="${x0}" y="${top}" width="${w}" height="${bottom - top}" fill="none" stroke="${INK}" stroke-width="3"/>
  ${holes()}
</svg>`;
}

const backSvg = (src: string) => `${svgOpen()}
  ${fullImage(src)}
  ${holes()}
</svg>`;

export type BookPage = { key: string; label: string; svg: string };

/** 쪽 너비(mm)로 고를 수 있는 범위. 높이는 그림 비율(105 / 148)을 따름 */
export const BOOK_MM_MIN = 60;
export const BOOK_MM_MAX = 296;
export const bookHeightMm = (w: number) => Math.round(((w * BOOK_MM.h) / BOOK_MM.w) * 10) / 10;

export type SheetLayout = {
  orientation: "landscape" | "portrait";
  /** 종이 크기 (mm) */
  paper: { w: number; h: number };
  /** 한 쪽 크기 (mm) */
  page: { w: number; h: number };
  cols: number;
  rows: number;
  perSheet: number;
  /** 가운데 놓기 위한 왼쪽 · 위쪽 여백 (mm) */
  left: number;
  top: number;
};

/** 쪽 너비 w(mm)로 A4 한 장에 가장 많이 들어가도록 가로/세로 방향과 격자를 고름 (같으면 가로) */
export function a4Layout(w: number): SheetLayout {
  const page = { w, h: bookHeightMm(w) };
  const options = (["landscape", "portrait"] as const).map((orientation) => {
    const paper = orientation === "landscape" ? { w: 297, h: 210 } : { w: 210, h: 297 };
    const cols = Math.max(1, Math.floor((paper.w + 0.01) / page.w));
    const rows = Math.max(1, Math.floor((paper.h + 0.01) / page.h));
    return {
      orientation,
      paper,
      page,
      cols,
      rows,
      perSheet: cols * rows,
      left: (paper.w - cols * page.w) / 2,
      top: (paper.h - rows * page.h) / 2,
    };
  });
  return options[1].perSheet > options[0].perSheet ? options[1] : options[0];
}

/** A4 한 장에 n쪽 이상 들어가는 가장 큰 쪽 너비 (mm) */
export function largestWidthFor(n: number) {
  for (let w = BOOK_MM_MAX; w >= BOOK_MM_MIN; w--) if (a4Layout(w).perSheet >= n) return w;
  return BOOK_MM_MIN;
}

/** 표지 · 속지 · 거래 내역(ledgers 쪽) · 뒤표지 순서의 모든 쪽 */
export function bankbookPages(b: Bankbook, ledgers: number): BookPage[] {
  const ledger = ledgerSvg();
  return [
    { key: "cover", label: "표지", svg: coverSvg(b) },
    { key: "info", label: "속지", svg: infoSvg(b) },
    ...Array.from({ length: ledgers }, (_, i) => ({ key: `ledger-${i}`, label: `거래 내역 ${i + 1}`, svg: ledger })),
    { key: "back", label: "뒤표지", svg: backSvg(b.back) },
  ];
}

/** 글꼴을 내려받을 때 필요한 글자 */
export const bankbookText = (b: Bankbook) =>
  [TITLE, "이름 :", b.name, b.bank, b.branch, b.account, b.issued, "지점계좌번호구분신규재발급통장발행일서명담임확인날짜내용적립P차감P계",
    "본인임을 증명하는 서명을 적으세요.통장이 본인 소유임을 증명합니다."].join("");
