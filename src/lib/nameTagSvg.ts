/**
 * 이름표: 위쪽은 AI 그림(없으면 기본 느티나무 그림), 아래쪽 흰 칸에 반 이름과 학생 이름.
 * 크기는 90 × 55mm. A4 세로 한 장에 10개(2 × 5)씩 인쇄합니다.
 */
import { esc, FONT } from "./svgExport";

export const TAG_W = 900;
export const TAG_H = 550;
export const TAG_MM = { w: 90, h: 55 };

const INK = "#3a3030";

/** 이름 칸 테두리 · 반 이름 색 */
export const TAG_COLORS = {
  초록: "#4f9a5a",
  분홍: "#e0607e",
  하늘: "#3f86c6",
  보라: "#8a63c9",
  주황: "#e08a2e",
} as const;
export type TagColor = keyof typeof TAG_COLORS;

export type NameTag = { name: string; label: string; color: TagColor; art?: string };

/** 기본 그림: 맑은 하늘, 언덕 위 느티나무, 구름 */
function defaultArt() {
  return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bfe3fb"/><stop offset="1" stop-color="#eef8ff"/></linearGradient></defs>
    <rect width="${TAG_W}" height="${TAG_H}" fill="url(#sky)"/>
    <circle cx="790" cy="80" r="46" fill="#ffe27a"/>
    <g fill="#fff"><ellipse cx="170" cy="90" rx="70" ry="26"/><ellipse cx="215" cy="74" rx="44" ry="30"/>
      <ellipse cx="560" cy="60" rx="56" ry="20"/><ellipse cx="596" cy="48" rx="34" ry="22"/></g>
    <ellipse cx="200" cy="560" rx="420" ry="190" fill="#a9d98f"/>
    <ellipse cx="760" cy="580" rx="380" ry="200" fill="#8fcd78"/>
    <rect x="110" y="200" width="30" height="120" rx="10" fill="#8a5a3c"/>
    <g fill="#5fae5b"><circle cx="125" cy="170" r="70"/><circle cx="72" cy="200" r="48"/><circle cx="180" cy="196" r="52"/></g>
    <rect x="770" y="230" width="22" height="90" rx="8" fill="#8a5a3c"/>
    <g fill="#6fbf63"><circle cx="781" cy="206" r="52"/><circle cx="742" cy="230" r="34"/><circle cx="822" cy="228" r="38"/></g>`;
}

export function nameTagSvg(t: NameTag) {
  const color = TAG_COLORS[t.color];
  const name = t.name || "○○○";
  const len = [...name].length;
  const fontSize = Math.min(124, Math.floor(640 / Math.max(len, 1)));
  const art = t.art
    ? `<image href="${t.art}" xlink:href="${t.art}" x="0" y="0" width="${TAG_W}" height="${TAG_H}" preserveAspectRatio="xMidYMid slice"/>`
    : defaultArt();
  const px0 = 70;
  const py0 = 236;
  const pw = TAG_W - px0 * 2;
  const ph = 270;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${TAG_W} ${TAG_H}" width="${TAG_W}" height="${TAG_H}" font-family='${FONT}'>
  ${art}
  <rect x="${px0}" y="${py0}" width="${pw}" height="${ph}" rx="44" fill="#fff" fill-opacity="0.95" stroke="${color}" stroke-width="7"/>
  ${
    t.label
      ? `<rect x="${TAG_W / 2 - Math.max(120, [...t.label].length * 17 + 40)}" y="${py0 - 26}" width="${Math.max(240, [...t.label].length * 34 + 80)}" height="52" rx="26" fill="${color}"/>
  <text x="${TAG_W / 2}" y="${py0 + 11}" text-anchor="middle" font-size="30" fill="#fff">${esc(t.label)}</text>`
      : ""
  }
  <text x="${TAG_W / 2}" y="${py0 + ph / 2 + fontSize * 0.36 + (t.label ? 12 : 0)}" text-anchor="middle" font-size="${fontSize}" fill="${INK}" letter-spacing="${len <= 3 ? 10 : 2}">${esc(name)}</text>
</svg>`;
}

export const nameTagText = (tags: NameTag[]) => tags.map((t) => t.name + t.label).join("") + "○";
