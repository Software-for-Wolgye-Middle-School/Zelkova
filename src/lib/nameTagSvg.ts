/**
 * 이름표: 오색(또는 한 가지 색) 테두리 흰 카드, 왼쪽에 아이콘(public/icon 그림), 오른쪽에 반 이름과 학생 이름.
 * 크기는 90 × 40mm. A4 세로 한 장에 14개(2 × 7)씩 인쇄합니다.
 */
import { esc, FONT } from "./svgExport";

export const TAG_W = 900;
export const TAG_H = 400;
export const TAG_MM = { w: 90, h: 40 };

const INK = "#222";
/** public/icon 의 아이콘 그림 */
export const ICON_OPTIONS = [
  { id: "clover", label: "네잎클로버", src: "/icon/clover.png" },
  { id: "muzi", label: "무지", src: "/icon/muzi.png" },
  { id: "ryon", label: "라이언", src: "/icon/ryon.png" },
] as const;
export type IconId = (typeof ICON_OPTIONS)[number]["id"];

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

/** icon: 고른 아이콘 (기본 아이콘 또는 직접 등록한 이모티콘의 id), art: 그 아이콘 그림 (data: 주소, 불러오는 동안은 없음) */
export type NameTag = { name: string; label: string; icon: string; art?: string; border?: TagBorder };

/** 왼쪽 그림 자리에 아이콘 */
function iconImage(t: NameTag, cx: number, cy: number, size: number) {
  if (!t.art) return "";
  return `<image href="${t.art}" xlink:href="${t.art}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" clip-path="url(#tag-inner)"/>`;
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
  ${iconImage(t, 210, 200, 290)}
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

export const nameTagText = (tags: NameTag[]) => tags.map((t) => t.name + t.label).join("") + "○";
