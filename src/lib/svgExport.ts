/**
 * 코드로 그린 SVG(약속판 · 칭찬통장 · 이름표)를 그림 파일로 저장하거나 인쇄하는 공통 도구 (브라우저 전용).
 */

export const FONT = `Jua, "Malgun Gothic", "맑은 고딕", sans-serif`;

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim();

/** 쓰인 글자만 담은 작은 Jua 글꼴을 받아 SVG 안에 넣을 @font-face 로 만듦 (실패하면 기본 글꼴 사용) */
export async function embeddedFontCss(text: string) {
  const chars = [...new Set((text + "0123456789").replace(/\s/g, ""))].join("");
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Jua&text=${encodeURIComponent(chars)}`)).text();
    const url = css.match(/url\((https:[^)]+)\)/)?.[1];
    if (!url) return "";
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const format = url.includes(".woff2") ? "woff2" : url.includes(".woff") ? "woff" : "truetype";
    return `@font-face{font-family:'Jua';src:url(data:font/${format};base64,${toBase64(buf)}) format('${format}');}`;
  } catch {
    return "";
  }
}

function toBase64(buf: Uint8Array) {
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** SVG 안에 글꼴을 넣음 (<svg ...> 바로 뒤에 <style> 추가) */
export const withFont = (svg: string, fontCss: string) => (fontCss ? svg.replace(/(<svg[^>]*>)/, `$1<style>${fontCss}</style>`) : svg);

/** SVG 문자열 → PNG. 그림이 들어 있으면 data: 주소여야 함 (외부 주소는 캔버스에 그려지지 않음) */
export async function svgToPng(svg: string, width: number, height: number, scale = 2.5): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    // 글꼴이 그림에 반영될 시간을 조금 줌
    await new Promise((r) => setTimeout(r, 100));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG 변환 실패"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 새 창에서 인쇄. 각 장(sheet)은 종이 한 장이고, 그 안에 SVG 를 격자로 배치 (cols × rows, 크기는 mm).
 * 여러 개를 한 장에 놓을 때는 자르기 쉽도록 점선 테두리를 그림.
 */
export function printSheets(
  win: Window,
  {
    title,
    page,
    items,
    itemMm,
    cols,
    rows,
    cutLines = cols * rows > 1,
  }: {
    title: string;
    page: { w: number; h: number; css: string };
    items: string[];
    itemMm: { w: number; h: number };
    cols: number;
    rows: number;
    cutLines?: boolean;
  },
) {
  const per = cols * rows;
  const sheets = Array.from({ length: Math.ceil(items.length / per) }, (_, i) => items.slice(i * per, i * per + per));
  const body = sheets
    .map(
      (sheet) =>
        `<section class="sheet"><div class="grid">${sheet.map((svg) => `<div class="cell">${svg}</div>`).join("")}</div></section>`,
    )
    .join("");
  win.document.write(
    `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>` +
      `@page{size:${page.css};margin:0}html,body{margin:0}` +
      `.sheet{width:${page.w}mm;height:${page.h}mm;display:flex;align-items:center;justify-content:center;page-break-after:always;break-after:page;overflow:hidden}` +
      `.grid{display:grid;grid-template-columns:repeat(${cols},${itemMm.w}mm);grid-auto-rows:${itemMm.h}mm}` +
      `.cell{${cutLines ? "outline:0.2mm dashed #bbb;" : ""}overflow:hidden}` +
      `.cell svg{display:block;width:${itemMm.w}mm;height:${itemMm.h}mm}` +
      `</style>${body}` +
      `<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))<\/script>`,
  );
  win.document.close();
}
