/**
 * 긍정 · 감성 필사 교실: 글의 길이(어휘 · 문장 · 이야기)별 문구와 칸 공책 모양의 학습지를 만듭니다.
 * 학습지는 A4 세로 한 장마다 SVG 하나로 그리며, 화면 미리보기와 PDF 저장이 같은 그림을 씁니다.
 */
import { embeddedFontCss, esc, svgToPng, withFont } from "./svgExport";

export type Level = "word" | "sentence" | "story";
/** 문구를 고른 주제 (화면에서 주제를 고르지 않고 모든 주제의 문구를 씀) */
type Theme = "self" | "friend" | "feeling" | "school" | "thanks" | "spring" | "summer" | "autumn" | "winter";
/** trace: 연한 글씨 따라 쓰기 · look: 보고 쓰기 · blank: 완전 빈칸 */
export type Mode = "trace" | "look" | "blank";
export type FontKind = "gothic" | "gungsuh" | "round";

export const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: "word", label: "어휘", hint: "낱말 하나" },
  { id: "sentence", label: "문장", hint: "한 문장" },
  { id: "story", label: "이야기", hint: "짧은 글" },
];

export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "trace", label: "따라 쓰기", hint: "연한 글씨 위에 덧쓰고, 아래 빈칸에 한 번 더" },
  { id: "look", label: "보고 쓰기", hint: "위의 글을 보고 아래 빈칸에 쓰기" },
  { id: "blank", label: "빈칸", hint: "선생님이 불러 주는 글을 받아쓰기" },
];

export const FONTS: { id: FontKind; label: string; css: string }[] = [
  { id: "gothic", label: "고딕", css: `"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif` },
  { id: "gungsuh", label: "바른 궁서", css: `"Gungsuh","궁서","Batang","바탕",serif` },
  { id: "round", label: "둥근 글씨", css: `Jua,"Malgun Gothic","맑은 고딕",sans-serif` },
];

/** 글자 칸 한 변의 길이 (mm). 글자 크기는 칸에 맞춰 정해짐 */
export const CELL_MM = { min: 8, max: 24, default: 13 };

type Pool = Record<Level, string[]>;

/** 주제마다 어휘 3 · 문장 2 · 이야기 1 */
const PHRASES: Record<Theme, Pool> = {
  self: {
    word: ["용기", "자신감", "도전"],
    sentence: ["나는 나라서 참 소중해요.", "실수해도 다시 하면 괜찮아요."],
    story: ["나는 오늘도 한 걸음 자랐어요. 어제보다 조금 더 잘할 수 있어요. 나는 내가 자랑스러워요."],
  },
  friend: {
    word: ["배려", "우정", "양보"],
    sentence: ["친구의 이야기를 끝까지 들어 줘요.", "고운 말은 친구를 웃게 해요."],
    story: ["짝꿍이 연필을 놓고 왔대요. 내 연필을 나누어 주었더니 둘 다 환하게 웃었어요. 함께하면 더 즐거워요."],
  },
  feeling: {
    word: ["기쁨", "차분함", "심호흡"],
    sentence: ["화가 날 때는 숨을 크게 쉬어요.", "내 마음을 솔직하게 말해 볼게요."],
    story: ["속상한 일이 있었어요. 숨을 세 번 크게 쉬었더니 마음이 조금 가라앉았어요. 이제 차근차근 이야기해 볼래요."],
  },
  school: {
    word: ["약속", "질서", "정직"],
    sentence: ["수업 시간에는 바른 자세로 앉아요.", "사용한 물건은 제자리에 놓아요."],
    story: ["종이 울리면 자리에 앉아요. 선생님 말씀을 귀 기울여 들어요. 약속을 지키는 내가 멋져요."],
  },
  thanks: {
    word: ["감사", "행복", "사랑"],
    sentence: ["고마운 마음은 말로 전해요.", "오늘도 건강하게 지내서 행복해요."],
    story: ["아침에 부모님께서 밥을 차려 주셨어요. 고맙다고 말씀드렸더니 활짝 웃으셨어요. 감사는 행복을 키워 줘요."],
  },
  spring: {
    word: ["새싹", "개나리", "봄바람"],
    sentence: ["봄바람이 살며시 꽃잎을 흔들어요.", "새싹이 땅속에서 고개를 내밀어요."],
    story: ["학교 화단에 새싹이 돋았어요. 나비도 팔랑팔랑 날아왔어요. 봄은 모두에게 새 힘을 줘요."],
  },
  summer: {
    word: ["수박", "매미", "소나기"],
    sentence: ["매미 소리가 여름을 알려 줘요.", "시원한 수박 한 조각이 참 달콤해요."],
    story: ["소나기가 지나가고 무지개가 떴어요. 친구들과 손을 모아 하늘을 가리켰어요. 여름은 신나는 계절이에요."],
  },
  autumn: {
    word: ["단풍", "은행잎", "보름달"],
    sentence: ["단풍잎이 노랗고 빨갛게 물들었어요.", "높은 하늘에 구름이 천천히 흘러가요."],
    story: ["운동장에 낙엽이 소복이 쌓였어요. 밟을 때마다 바삭바삭 소리가 나요. 가을은 마음도 깊어지게 해요."],
  },
  winter: {
    word: ["눈사람", "함박눈", "따뜻함"],
    sentence: ["하얀 눈이 소복소복 내려요.", "따뜻한 차 한 잔에 마음이 포근해져요."],
    story: ["아침에 일어나 보니 온 세상이 하얬어요. 친구와 함께 눈사람을 만들었어요. 추워도 마음은 따뜻했어요."],
  },
};

/** 모든 주제에서 고른 길이의 문구 */
export function phrasesFor(level: Level): string[] {
  return (Object.keys(PHRASES) as Theme[]).flatMap((t) => PHRASES[t][level]);
}

/** 순서 섞기 (Fisher–Yates) */
export function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 줄마다 한 문구 (앞뒤 공백 정리, 너무 긴 글은 자름) */
export const parsePhrases = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim().replace(/\s+/g, " ").slice(0, 120))
    .filter(Boolean);

export type Options = { mode: Mode; cell: number; font: FontKind; guide: boolean };

// ---------------------------------------------------------------- 배치 (단위 mm)
const PAGE = { w: 210, h: 297, margin: 14 };
const HEADER_MM = 40;
const FOOTER_MM = 8;
/** 문구 사이 · 한 문구 안의 줄 사이 간격 */
const ITEM_GAP_MM = 8;
const LINE_GAP_MM = 3;
/** 빈칸(띄어쓰기)은 글자 칸보다 좁게 */
const SPACE = 0.4;
const BODY_W = PAGE.w - PAGE.margin * 2;

/** 한 줄에 놓이는 글자들의 너비 (칸 단위) */
const unitsOf = (text: string) => [...text].reduce((n, ch) => n + (ch === " " ? SPACE : 1), 0);

/** 칸 공책 한 줄에 들어가도록 나눔. 낱말 중간에서는 끊지 않고, 한 줄보다 긴 낱말만 글자 단위로 끊음 */
export function splitLines(text: string, cell: number) {
  const max = Math.max(1, Math.floor(BODY_W / cell));
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (unitsOf(next) <= max) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = word;
    while (unitsOf(cur) > max) {
      lines.push([...cur].slice(0, max).join(""));
      cur = [...cur].slice(max).join("");
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** 쪽 안에 놓인 한 줄: 위는 본보기(따라 쓰기 · 보고 쓰기), 바로 아래는 빈칸 */
export type PlacedLine = { y: number; text: string };

/**
 * 문구를 줄 단위로 쪽에 채움. 쪽이 모자라면 문구 중간에서도 다음 쪽으로 넘어감 (한 줄과 그 빈칸은 늘 같은 쪽).
 * 결과는 쪽마다 놓인 줄 목록
 */
export function paginate(phrases: string[], o: Options): PlacedLine[][] {
  const top = PAGE.margin + HEADER_MM;
  const bottom = PAGE.h - PAGE.margin - FOOTER_MM;
  const pairH = (o.mode === "blank" ? 1 : 2) * o.cell;
  const pages: PlacedLine[][] = [];
  let page: PlacedLine[] = [];
  let y = top;
  for (const phrase of phrases) {
    splitLines(phrase, o.cell).forEach((text, j) => {
      const gap = page.length ? (j === 0 ? ITEM_GAP_MM : LINE_GAP_MM) : 0;
      if (page.length && y + gap + pairH > bottom) {
        pages.push(page);
        page = [];
        y = top;
      } else {
        y += gap;
      }
      page.push({ y, text });
      y += pairH;
    });
  }
  if (page.length) pages.push(page);
  return pages;
}

// ---------------------------------------------------------------- 학습지 그림
/** A4 를 화면 · 그림 파일로 그릴 때의 크기 (px, 96dpi) */
export const SHEET_PX = { w: 794, h: 1123 };

const fontCss = (o: Options) => FONTS.find((f) => f.id === o.font)!.css;

/** 한 줄의 글자 칸들. kind: trace 연한 글씨 · look 테두리 없는 진한 글씨 · empty 빈칸 */
function rowSvg(text: string, y: number, o: Options, kind: "trace" | "look" | "empty") {
  const c = o.cell;
  const size = c * 0.66;
  let x = PAGE.margin;
  const out: string[] = [];
  for (const ch of text) {
    if (ch === " ") {
      x += c * SPACE;
      continue;
    }
    if (kind !== "look") {
      out.push(`<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="none" stroke="#888" stroke-width="0.25"/>`);
      if (o.guide) {
        out.push(
          `<path d="M${x + c / 2} ${y}V${y + c}M${x} ${y + c / 2}H${x + c}" stroke="#d0d4da" stroke-width="0.2" stroke-dasharray="0.8 0.8"/>`,
        );
      }
    }
    if (kind !== "empty") {
      out.push(
        `<text x="${x + c / 2}" y="${y + c / 2 + size * 0.36}" font-size="${size}" text-anchor="middle" fill="${kind === "trace" ? "#c4c4c4" : "#222"}">${esc(ch)}</text>`,
      );
    }
    x += c;
  }
  return out.join("");
}

/** A4 한 쪽 학습지 SVG */
export function pageSvg(lines: PlacedLine[], index: number, o: Options) {
  const right = PAGE.w - PAGE.margin;
  const body = lines
    .map(({ y, text }) =>
      o.mode === "blank" ? rowSvg(text, y, o, "empty") : rowSvg(text, y, o, o.mode === "trace" ? "trace" : "look") + rowSvg(text, y + o.cell, o, "empty"),
    )
    .join("");
  const ui = `"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE.w} ${PAGE.h}" width="${SHEET_PX.w}" height="${SHEET_PX.h}">
  <rect width="${PAGE.w}" height="${PAGE.h}" fill="#fff"/>
  <g font-family='${ui}' fill="#222">
    <text x="${PAGE.w / 2}" y="${PAGE.margin + 8}" font-size="8" font-weight="700" text-anchor="middle" letter-spacing="0.3">오늘의 바른 글씨 쓰기</text>
    <text x="${PAGE.margin}" y="${PAGE.margin + 19}" font-size="4">날짜 : ____월 ____일</text>
    <text x="${right}" y="${PAGE.margin + 19}" font-size="4" text-anchor="end">이름 : ______________</text>
    <text x="${PAGE.w / 2}" y="${PAGE.margin + 27}" font-size="3.4" fill="#666" text-anchor="middle">바른 자세로 연필을 바르게 쥐고, 한 글자씩 또박또박 정성껏 써 보아요.</text>
    <text x="${PAGE.margin}" y="${PAGE.h - PAGE.margin}" font-size="3.4" fill="#777">선생님 확인 ☐</text>
    <text x="${right}" y="${PAGE.h - PAGE.margin}" font-size="3.4" fill="#777" text-anchor="end">${index + 1}쪽</text>
  </g>
  <g font-family='${fontCss(o)}'>${body}</g>
</svg>`;
}

/** 모든 쪽을 A4 PDF 하나로 */
export async function worksheetPdf(pages: PlacedLine[][], o: Options): Promise<Blob> {
  const text = pages.flatMap((p) => p.map((l) => l.text)).join("");
  // 둥근 글씨(Jua)는 웹 글꼴이라 그림 안에 넣어야 PDF 에도 그 글꼴로 나옴
  const [{ jsPDF }, css] = await Promise.all([import("jspdf"), o.font === "round" ? embeddedFontCss(text) : Promise.resolve("")]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  for (const [i, lines] of pages.entries()) {
    if (i > 0) doc.addPage();
    const svg = withFont(pageSvg(lines, i, o), css);
    const jpeg = await svgToPng(svg, SHEET_PX.w, SHEET_PX.h, 2.5, "image/jpeg");
    doc.addImage(new Uint8Array(await jpeg.arrayBuffer()), "JPEG", 0, 0, PAGE.w, PAGE.h, `page-${i}`);
  }
  return doc.output("blob");
}
