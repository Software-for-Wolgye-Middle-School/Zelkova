/**
 * 칭찬통장: 올려 준 실물 통장과 같은 구성으로 코드로 그립니다.
 *  1) 표지 — AI 그림(없으면 기본 보름달 그림) 위에 '칭찬 통장' 제목, 이름표, 은행 이름
 *  2) 속지 — 말풍선 칸(이름 · 지점 · 계좌번호 · 구분 · 통장 발행일), 은행 이름과 도장, 서명 칸
 *  3) 거래 내역 — 날짜 | 내용 | 적립P | 사용P | 계 표
 * 크기는 A6 가로(148 × 105mm). A4 가로 한 장에 4쪽씩 인쇄합니다.
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
  /** 표지 그림 (data: 주소). 없으면 기본 그림 */
  cover?: string;
};

const svgOpen = (w = BOOK_W, h = BOOK_H) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family='${FONT}'>`;

/** 바인더 링 구멍 자리 (위쪽 가장자리) */
const holes = () =>
  [0.27, 0.73]
    .map((p) => `<circle cx="${BOOK_W * p}" cy="30" r="11" fill="#fff" fill-opacity="0.85" stroke="#999" stroke-width="2"/>`)
    .join("");

/** 기본 표지 그림: 템플릿처럼 남색 밤하늘, 왼쪽 아래 큰 보름달, 감나무 가지 */
function defaultCoverArt() {
  const persimmon = (x: number, y: number, r = 26) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#f07a4a"/><path d="M${x - 8} ${y - r + 4} q8 -10 16 0 q-8 4 -16 0z" fill="#3f7d4a"/>`;
  return `<defs>
      <radialGradient id="glow" cx="0.18" cy="1.05" r="0.75">
        <stop offset="0.55" stop-color="#fff3b0" stop-opacity="0.9"/>
        <stop offset="0.7" stop-color="#7f78c9" stop-opacity="0.35"/>
        <stop offset="1" stop-color="#4b47a3" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${BOOK_W}" height="${BOOK_H}" fill="#4b47a3"/>
    <rect width="${BOOK_W}" height="${BOOK_H}" fill="url(#glow)"/>
    <circle cx="150" cy="700" r="390" fill="#f6b72c"/>
    <g fill="none" stroke="#eea21f" stroke-width="22" opacity="0.8">
      <ellipse cx="90" cy="430" rx="60" ry="48"/><ellipse cx="270" cy="520" rx="70" ry="54"/><ellipse cx="60" cy="600" rx="44" ry="36"/>
    </g>
    <g stroke="#5a3a2a" stroke-linecap="round" fill="none">
      <path d="M${BOOK_W + 10} 120 C760 150 700 110 640 40" stroke-width="30"/>
      <path d="M${BOOK_W + 10} 560 C780 520 760 470 700 450" stroke-width="34"/>
      <path d="M760 505 C730 430 760 380 740 330" stroke-width="20"/>
    </g>
    ${persimmon(690, 70)}${persimmon(780, 130, 30)}${persimmon(735, 320, 24)}${persimmon(690, 470, 30)}`;
}

function coverSvg(b: Bankbook) {
  const name = esc(b.name || "○○○");
  const pillW = Math.max(250, 150 + [...(b.name || "○○○")].length * 40);
  const art = b.cover
    ? `<image href="${b.cover}" xlink:href="${b.cover}" x="0" y="0" width="${BOOK_W}" height="${BOOK_H}" preserveAspectRatio="xMidYMid slice"/>`
    : defaultCoverArt();
  return `${svgOpen()}
  ${art}
  <text x="${BOOK_W / 2}" y="292" text-anchor="middle" font-size="128" fill="#ffd84a" stroke="#3b2f63" stroke-width="14" stroke-linejoin="round" paint-order="stroke">${TITLE}</text>
  <g transform="translate(44 520)">
    <rect width="${pillW}" height="72" rx="36" fill="#fff" fill-opacity="0.94" stroke="${INK}" stroke-opacity="0.15" stroke-width="2"/>
    <path d="M38 50 q-14 -22 6 -30 q6 16 -6 30z M38 50 q4 -24 24 -20 q-6 18 -24 20z" fill="#7cc36e"/>
    <text x="74" y="49" font-size="32" fill="${INK}">이름. <tspan font-size="38">${name}</tspan></text>
  </g>
  <text x="${BOOK_W - 40}" y="${BOOK_H - 36}" text-anchor="end" font-size="26" fill="#fff" stroke="#3b2f63" stroke-width="6" stroke-linejoin="round" paint-order="stroke">${esc(b.bank)}</text>
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
    ["사용P", 0.14],
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

export type BookPage = { key: string; label: string; svg: string };

/** 표지 · 속지 · 거래 내역(ledgers 쪽) 순서의 모든 쪽 */
export function bankbookPages(b: Bankbook, ledgers: number): BookPage[] {
  const ledger = ledgerSvg();
  return [
    { key: "cover", label: "표지", svg: coverSvg(b) },
    { key: "info", label: "속지", svg: infoSvg(b) },
    ...Array.from({ length: ledgers }, (_, i) => ({ key: `ledger-${i}`, label: `거래 내역 ${i + 1}`, svg: ledger })),
  ];
}

/** 글꼴을 내려받을 때 필요한 글자 */
export const bankbookText = (b: Bankbook) =>
  [TITLE, "이름.", b.name, b.bank, b.branch, b.account, b.issued, "지점계좌번호구분신규재발급통장발행일서명담임확인날짜내용적립P사용P계",
    "본인임을 증명하는 서명을 적으세요.통장이 본인 소유임을 증명합니다."].join("");
