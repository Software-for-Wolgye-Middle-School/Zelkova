/**
 * 이름표: 오색(또는 한 가지 색) 테두리 흰 카드, 왼쪽에 캐릭터 얼굴, 오른쪽에 반 이름과 학생 이름.
 * 캐릭터는 코드로 그린 남녀 6색(여자 아이: 머리 장식 색, 남자 아이: 모자 색) 또는 AI로 그린 그림.
 * 크기는 90 × 40mm. A4 세로 한 장에 14개(2 × 7)씩 인쇄합니다.
 */
import { esc, FONT } from "./svgExport";

export const TAG_W = 900;
export const TAG_H = 400;
export const TAG_MM = { w: 90, h: 40 };

const INK = "#222";
const HAIR = "#2b2a2e";
const SKIN = "#ffe1cf";

/** 캐릭터 색: [밝은 색, 진한 색] */
export const CHAR_COLORS = {
  보라: ["#c3aeea", "#9b82d6"],
  노랑: ["#fbd96f", "#eab93c"],
  분홍: ["#f9a3b7", "#ec7593"],
  초록: ["#a8de7c", "#7cc256"],
  하늘: ["#8fcdf3", "#58ade6"],
  주황: ["#fbb26f", "#ef8f3d"],
} as const;
export type CharColor = keyof typeof CHAR_COLORS;

/** "girl-보라" · "boy-하늘" 처럼 코드로 그린 캐릭터, 또는 "ai" (AI로 그린 그림) */
export type CharId = `${"girl" | "boy"}-${CharColor}` | "ai";

export const CHAR_OPTIONS: { id: CharId; label: string }[] = (["girl", "boy"] as const).flatMap((kind) =>
  (Object.keys(CHAR_COLORS) as CharColor[]).map((c) => ({
    id: `${kind}-${c}` as CharId,
    label: `${kind === "girl" ? "여자 아이" : "남자 아이"} · ${c}`,
  })),
);

/** 테두리 오색 (분홍 · 주황 · 노랑 · 연두 · 파랑 · 보라 순서로 반복) */
const BORDER = ["#f8829a", "#fbb06c", "#f9dc6a", "#c7ea84", "#79b4ee", "#b9a1e6"];

/** 테두리: "rainbow" (오색) 또는 한 가지 색 ("#rrggbb") */
export type TagBorder = "rainbow" | `#${string}`;

export const BORDER_OPTIONS: { id: TagBorder; label: string }[] = [
  { id: "rainbow", label: "오색" },
  { id: "#f8829a", label: "분홍" },
  { id: "#fbb06c", label: "주황" },
  { id: "#f9dc6a", label: "노랑" },
  { id: "#a8de7c", label: "초록" },
  { id: "#79b4ee", label: "하늘" },
  { id: "#b9a1e6", label: "보라" },
];

/** 미리보기 칩에 쓰는 오색 원 배경 */
export const RAINBOW_CSS = `conic-gradient(${BORDER.map((c, i) => `${c} ${(i * 100) / BORDER.length}% ${((i + 1) * 100) / BORDER.length}%`).join(", ")})`;

export type NameTag = { name: string; label: string; char: CharId; art?: string; border?: TagBorder };

/** 공통 얼굴: 피부, 눈, 볼, 입 */
function face(cx: number, cy: number, r: number) {
  return `<ellipse cx="${cx}" cy="${cy + r * 0.28}" rx="${r * 0.9}" ry="${r * 0.72}" fill="${SKIN}"/>
    <circle cx="${cx - r * 0.32}" cy="${cy + r * 0.32}" r="${r * 0.075}" fill="${INK}"/>
    <circle cx="${cx + r * 0.32}" cy="${cy + r * 0.32}" r="${r * 0.075}" fill="${INK}"/>
    <ellipse cx="${cx - r * 0.55}" cy="${cy + r * 0.52}" rx="${r * 0.16}" ry="${r * 0.1}" fill="#ffb1b1"/>
    <ellipse cx="${cx + r * 0.55}" cy="${cy + r * 0.52}" rx="${r * 0.16}" ry="${r * 0.1}" fill="#ffb1b1"/>
    <path d="M${cx - r * 0.1} ${cy + r * 0.5} q${r * 0.1} ${r * 0.12} ${r * 0.2} 0" fill="none" stroke="#f0727f" stroke-width="${r * 0.05}" stroke-linecap="round"/>`;
}

/** 여자 아이: 검은 머리, 양옆 꽁지, 정수리 머리 장식 */
function girl(cx: number, cy: number, r: number, [light, dark]: readonly [string, string]) {
  return `<circle cx="${cx - r * 0.95}" cy="${cy + r * 0.35}" r="${r * 0.26}" fill="${HAIR}"/>
    <circle cx="${cx + r * 0.95}" cy="${cy + r * 0.35}" r="${r * 0.26}" fill="${HAIR}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.88}" fill="${HAIR}"/>
    ${face(cx, cy, r)}
    <ellipse cx="${cx}" cy="${cy - r * 0.6}" rx="${r * 0.42}" ry="${r * 0.16}" fill="${light}" stroke="${dark}" stroke-width="${r * 0.04}"/>
    <circle cx="${cx}" cy="${cy - r * 0.6}" r="${r * 0.1}" fill="${dark}"/>
    <circle cx="${cx - r * 0.24}" cy="${cy - r * 0.6}" r="${r * 0.035}" fill="#fff"/>
    <circle cx="${cx + r * 0.24}" cy="${cy - r * 0.6}" r="${r * 0.035}" fill="#fff"/>`;
}

/** 남자 아이: 색 모자(털모자), 아래로 검은 앞머리 */
function boy(cx: number, cy: number, r: number, [light, dark]: readonly [string, string]) {
  return `<ellipse cx="${cx}" cy="${cy + r * 0.05}" rx="${r * 0.95}" ry="${r * 0.6}" fill="${HAIR}"/>
    ${face(cx, cy, r)}
    <path d="M${cx - r * 1.02} ${cy - r * 0.02} C${cx - r * 1.02} ${cy - r * 1.18} ${cx + r * 1.02} ${cy - r * 1.18} ${cx + r * 1.02} ${cy - r * 0.02} Z" fill="${light}"/>
    <rect x="${cx - r * 0.86}" y="${cy - r * 0.02}" width="${r * 1.72}" height="${r * 0.2}" rx="${r * 0.08}" fill="${HAIR}"/>
    <rect x="${cx - r * 1.06}" y="${cy - r * 0.2}" width="${r * 2.12}" height="${r * 0.24}" rx="${r * 0.12}" fill="${dark}"/>
    <path d="M${cx - r * 0.5} ${cy - r * 0.78} q${r * 0.1} ${-r * 0.1} ${r * 0.24} ${-r * 0.12}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="${r * 0.07}" stroke-linecap="round"/>`;
}

function character(t: NameTag, cx: number, cy: number, r: number) {
  if (t.char === "ai") {
    if (!t.art) return "";
    const s = r * 2.5;
    return `<image href="${t.art}" xlink:href="${t.art}" x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid meet" clip-path="url(#tag-inner)"/>`;
  }
  const [kind, color] = t.char.split("-") as ["girl" | "boy", CharColor];
  return kind === "girl" ? girl(cx, cy, r, CHAR_COLORS[color]) : boy(cx, cy, r, CHAR_COLORS[color]);
}

/** 둥근 사각형 테두리를 같은 길이의 색 조각으로 나눠 칠함 (pathLength 로 길이를 맞춤) */
function rainbowBorder(x: number, y: number, w: number, h: number, rx: number, width: number) {
  const pieces = 30;
  const seg = 1000 / pieces;
  return BORDER.map(
    (c, i) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${c}" stroke-width="${width}" pathLength="1000" stroke-dasharray="${seg} ${seg * (BORDER.length - 1)}" stroke-dashoffset="${-i * seg}"/>`,
  ).join("");
}

export function nameTagSvg(t: NameTag) {
  const name = t.name || "○○○";
  const len = [...name].length;
  const textX = 610;
  const fontSize = Math.min(132, Math.floor(470 / Math.max(len, 1.6)));
  const nameY = t.label ? 300 : 200 + fontSize * 0.36;
  const b = 26; // 테두리 굵기
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${TAG_W} ${TAG_H}" width="${TAG_W}" height="${TAG_H}" font-family='${FONT}'>
  <defs><clipPath id="tag-inner"><rect x="${b * 1.5}" y="${b * 1.5}" width="${TAG_W - b * 3}" height="${TAG_H - b * 3}" rx="36"/></clipPath></defs>
  <rect x="${b}" y="${b}" width="${TAG_W - b * 2}" height="${TAG_H - b * 2}" rx="48" fill="#fff"/>
  ${character(t, 200, 214, 118)}
  ${
    !t.border || t.border === "rainbow"
      ? rainbowBorder(b, b, TAG_W - b * 2, TAG_H - b * 2, 48, b)
      : `<rect x="${b}" y="${b}" width="${TAG_W - b * 2}" height="${TAG_H - b * 2}" rx="48" fill="none" stroke="${esc(t.border)}" stroke-width="${b}"/>`
  }
  ${t.label ? `<text x="${textX}" y="152" text-anchor="middle" font-size="54" fill="${INK}">${esc(t.label)}</text>` : ""}
  <text x="${textX}" y="${nameY}" text-anchor="middle" font-size="${fontSize}" fill="${INK}" letter-spacing="${len <= 3 ? 8 : 2}">${esc(name)}</text>
</svg>`;
}

/** A4 세로 한 장 (1mm = 10, 이름표 한 개와 같은 비율) */
export const SHEET_W = 2100;
export const SHEET_H = 2970;
export const SHEET_COLS = 2;
export const SHEET_ROWS = 7;

/** 이름표 SVG 들을 A4 장마다 2 × 7 격자로 모아 한 장짜리 SVG 로 만듦 (인쇄와 같은 배치) */
export function nameTagSheetSvgs(tagSvgs: string[]) {
  const per = SHEET_COLS * SHEET_ROWS;
  const left = (SHEET_W - TAG_W * SHEET_COLS) / 2;
  const top = (SHEET_H - TAG_H * SHEET_ROWS) / 2;
  return Array.from({ length: Math.ceil(tagSvgs.length / per) }, (_, p) => {
    const cells = tagSvgs
      .slice(p * per, p * per + per)
      .map((svg, i) =>
        svg.replace("<svg ", `<svg x="${left + (i % SHEET_COLS) * TAG_W}" y="${top + Math.floor(i / SHEET_COLS) * TAG_H}" `),
      );
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${SHEET_W} ${SHEET_H}" width="${SHEET_W}" height="${SHEET_H}">
  <rect width="${SHEET_W}" height="${SHEET_H}" fill="#fff"/>
  ${cells.join("\n")}
</svg>`;
  });
}

/** 미리보기 칩에 쓰는 작은 캐릭터 그림 */
export function characterIconSvg(id: Exclude<CharId, "ai">) {
  const [kind, color] = id.split("-") as ["girl" | "boy", CharColor];
  const body = kind === "girl" ? girl(50, 46, 34, CHAR_COLORS[color]) : boy(50, 46, 34, CHAR_COLORS[color]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
}

export const nameTagText = (tags: NameTag[]) => tags.map((t) => t.name + t.label).join("") + "○";
