/**
 * 긍정 · 감성 필사 교실: 글의 길이(어휘 · 문장 · 이야기)와 주제별 문구, 그리고 칸 공책 모양의 학습지(HTML)를 만듭니다.
 * 학습지는 A4 세로 한 장 단위이며, 화면 미리보기와 인쇄 창이 같은 마크업과 CSS 를 씁니다.
 */
import { esc } from "./svgExport";

export type Level = "word" | "sentence" | "story";
export type Theme = "all" | "self" | "friend" | "feeling" | "school" | "thanks" | "spring" | "summer" | "autumn" | "winter";
/** trace: 연한 글씨 따라 쓰기 · look: 보고 쓰기 · blank: 완전 빈칸 */
export type Mode = "trace" | "look" | "blank";
export type FontKind = "gothic" | "gungsuh" | "round";

export const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: "word", label: "어휘", hint: "낱말 하나" },
  { id: "sentence", label: "문장", hint: "한 문장" },
  { id: "story", label: "이야기", hint: "짧은 글" },
];

export const THEMES: { id: Theme; label: string; group: "all" | "character" | "season" }[] = [
  { id: "all", label: "전체", group: "all" },
  { id: "self", label: "자존감과 긍정", group: "character" },
  { id: "friend", label: "친구와 배려", group: "character" },
  { id: "feeling", label: "감정 표현과 조절", group: "character" },
  { id: "school", label: "학교생활과 약속", group: "character" },
  { id: "thanks", label: "감사와 행복", group: "character" },
  { id: "spring", label: "봄", group: "season" },
  { id: "summer", label: "여름", group: "season" },
  { id: "autumn", label: "가을", group: "season" },
  { id: "winter", label: "겨울", group: "season" },
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

export const CELL_SIZES = [
  { mm: 10, label: "작게" },
  { mm: 13, label: "보통" },
  { mm: 16, label: "크게" },
  { mm: 20, label: "아주 크게" },
] as const;

type Pool = Record<Level, string[]>;

/** 주제마다 어휘 3 · 문장 2 · 이야기 1 */
const PHRASES: Record<Exclude<Theme, "all">, Pool> = {
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

export function phrasesFor(level: Level, theme: Theme): string[] {
  const themes = theme === "all" ? (Object.keys(PHRASES) as Exclude<Theme, "all">[]) : [theme];
  return themes.flatMap((t) => PHRASES[t][level]);
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

export type Options = { mode: Mode; cell: number; font: FontKind; guide: boolean; perPage: number };

// ---------------------------------------------------------------- 배치
const PAGE = { w: 210, h: 297, margin: 14 };
const HEADER_MM = 40;
const ITEM_GAP_MM = 8;

const maxCols = (cell: number) => Math.max(1, Math.floor((PAGE.w - PAGE.margin * 2) / cell));
const rowsOf = (text: string, cell: number) => Math.ceil([...text].length / maxCols(cell));

/** 문구 하나가 차지하는 높이 (mm) */
function itemHeight(text: string, o: Options) {
  const rows = rowsOf(text, o.cell);
  return (o.mode === "blank" ? rows : rows * 2) * o.cell + ITEM_GAP_MM;
}

/** 문구를 쪽마다 나눔: 쪽당 문항 수 한도와 종이 높이 안에서 가능한 만큼 채움. 한 문구가 한 장보다 길면 혼자 한 쪽 (fits=false) */
export function paginate(phrases: string[], o: Options) {
  const usable = PAGE.h - PAGE.margin * 2 - HEADER_MM;
  const pages: { items: string[]; fits: boolean }[] = [];
  let cur: string[] = [];
  let used = 0;
  for (const p of phrases) {
    const h = itemHeight(p, o);
    if (cur.length && (cur.length >= o.perPage || used + h > usable)) {
      pages.push({ items: cur, fits: true });
      cur = [];
      used = 0;
    }
    cur.push(p);
    used += h;
  }
  if (cur.length) pages.push({ items: cur, fits: true });
  for (const pg of pages) pg.fits = pg.items.reduce((s, p) => s + itemHeight(p, o), 0) <= usable;
  return pages;
}

// ---------------------------------------------------------------- 학습지 마크업
const cells = (text: string, kind: "trace" | "empty") =>
  [...text]
    .map((ch) => (ch === " " ? `<i class="sp"></i>` : `<b class="c${kind === "trace" ? " t" : ""}">${kind === "trace" ? esc(ch) : ""}</b>`))
    .join("");

function itemHtml(text: string, o: Options) {
  const copy = `<div class="row">${cells(text, "empty")}</div>`;
  if (o.mode === "blank") return `<section class="item">${copy}</section>`;
  const model = o.mode === "trace" ? `<div class="row">${cells(text, "trace")}</div>` : `<div class="row model">${cells(text, "trace").replace(/ t"/g, ' m"')}</div>`;
  return `<section class="item">${model}${copy}</section>`;
}

/** 쪽 하나(A4)의 마크업 */
export function pageHtml(items: string[], index: number, o: Options) {
  return `<article class="page">
  <header>
    <h1>오늘의 바른 글씨 쓰기</h1>
    <p class="who"><span>날짜 : ____월 ____일</span><span>이름 : ______________</span></p>
    <p class="tip">바른 자세로 연필을 바르게 쥐고, 한 글자씩 또박또박 정성껏 써 보아요.</p>
  </header>
  <div class="body">${items.map((t) => itemHtml(t, o)).join("")}</div>
  <footer><span>선생님 확인 ☐</span><span>${index + 1}쪽</span></footer>
</article>`;
}

/** 학습지 CSS. scope 를 주면 그 안에서만 적용(화면 미리보기), 없으면 문서 전체(인쇄 창) */
export function worksheetCss(o: Options, scope = "") {
  const s = (sel: string) => (scope ? `${scope} ${sel}` : sel);
  const font = FONTS.find((f) => f.id === o.font)!.css;
  const c = o.cell;
  return `
${s(".page")}{box-sizing:border-box;width:${PAGE.w}mm;height:${PAGE.h}mm;padding:${PAGE.margin}mm;background:#fff;color:#222;font-family:${font};display:flex;flex-direction:column;overflow:hidden;break-after:page;page-break-after:always}
${s(".page header")}{height:${HEADER_MM - 8}mm;text-align:center;margin-bottom:8mm}
${s(".page h1")}{margin:0 0 3mm;font-size:8mm;font-weight:700;letter-spacing:.3mm}
${s(".who")}{margin:0 0 2mm;display:flex;justify-content:space-between;font-size:4mm}
${s(".tip")}{margin:0;font-size:3.4mm;color:#666}
${s(".body")}{flex:1;display:flex;flex-direction:column;gap:${ITEM_GAP_MM}mm}
${s(".row")}{display:flex;flex-wrap:wrap;width:${maxCols(c) * c}mm}
${s(".c")}{position:relative;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:${c}mm;height:${c}mm;border:.25mm solid #888;margin:0 -.125mm -.25mm 0;font-weight:400;font-size:${(c * 0.66).toFixed(2)}mm;line-height:1}
${s(".c.t")}{color:#c4c4c4}
${s(".c.m")}{color:#222;border-color:transparent}
${s(".sp")}{display:block;width:${(c * 0.4).toFixed(2)}mm;height:${c}mm}
${o.guide ? `${s(".c::before")}{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:.2mm dashed #d0d4da}
${s(".c::after")}{content:"";position:absolute;top:50%;left:0;right:0;border-top:.2mm dashed #d0d4da}` : ""}
${s(".page footer")}{display:flex;justify-content:space-between;font-size:3.4mm;color:#777;margin-top:4mm}
`;
}

/** 인쇄 창을 열어 학습지 전체를 인쇄 (팝업 차단을 피하려고 클릭하자마자 연 창을 받음) */
export function printWorksheet(win: Window, pages: string[], o: Options) {
  win.document.write(
    `<!doctype html><meta charset="utf-8"><title>바른 글씨 쓰기</title>` +
      `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet">` +
      `<style>@page{size:A4;margin:0}html,body{margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}${worksheetCss(o)}</style>` +
      `${pages.join("")}<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))<\/script>`,
  );
  win.document.close();
}
