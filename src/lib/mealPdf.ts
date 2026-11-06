import { PDFDocument, type PDFPage } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";

/** PDF 로 올라온 급식 안내에서 식단표 쪽만 남김 (서버 전용). */

/** A4 (pt) */
const A4 = { w: 595.28, h: 841.89 };
/** 새 쪽의 여백 (pt) */
const PAGE_MARGIN = 20;
/** 글자가 놓인 범위 바깥으로 표 테두리까지 더 남길 너비 (pt) */
const BORDER_PAD = 22;
/** 쪽을 채우려고 가로나 세로 한쪽만 더 늘릴 수 있는 최대 배율 (글자가 눈에 띄게 찌그러지지 않는 정도) */
const MAX_STRETCH = 1.2;

/**
 * 식단표가 있는 쪽 번호(0부터): 표 제목 · 머리글이 있거나 영양량 수치가 있는 쪽.
 * 안내 쪽에도 '식단' · '영양량' 이라는 낱말은 나오므로 낱말 하나로는 판단하지 않음.
 */
export function mealPageIndexes(pages: string[]) {
  const isMeal = pages.map((page) => {
    const t = page.replace(/\s/g, "");
    return (t.includes("식단표") && t.includes("요일") && t.includes("날짜")) || /에너지[\d.]+\/?단백질[\d.]+/.test(t);
  });
  const first = isMeal.indexOf(true);
  if (first < 0) return [];
  // 표가 여러 쪽에 걸치면 사이에 낀 쪽도 표의 일부
  const last = isMeal.lastIndexOf(true);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

type Box = { left: number; bottom: number; right: number; top: number };

/** 쪽에서 글자가 놓인 범위 + 테두리 여유 (글자가 없으면 쪽 전체) */
function contentBox(items: { transform: number[]; width: number; height: number }[], page: PDFPage): Box {
  const { width, height } = page.getSize();
  const full = { left: 0, bottom: 0, right: width, top: height };
  const boxes = items.filter((i) => i.width > 0).map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) }));
  if (!boxes.length) return full;
  return {
    left: Math.max(full.left, Math.min(...boxes.map((b) => b.x)) - BORDER_PAD),
    bottom: Math.max(full.bottom, Math.min(...boxes.map((b) => b.y)) - BORDER_PAD),
    right: Math.min(full.right, Math.max(...boxes.map((b) => b.x + b.w)) + BORDER_PAD),
    top: Math.min(full.top, Math.max(...boxes.map((b) => b.y + b.h)) + BORDER_PAD),
  };
}

/**
 * 식단표 쪽만 담은 PDF. 쪽마다 내용이 있는 부분만 잘라 A4 한 장에 꽉 차게 키움 (가로 · 세로 비율은 그대로).
 * 식단표 쪽을 찾지 못하거나 읽을 수 없으면 null
 */
export async function keepMealPages(file: Uint8Array): Promise<Uint8Array | null> {
  try {
    // pdf.js 가 넘겨받은 버퍼를 비워 버리므로 복사본을 줌
    const proxy = await getDocumentProxy(file.slice());
    const { text } = await extractText(proxy, { mergePages: false });
    const keep = mealPageIndexes(text);
    if (!keep.length) return null;
    const source = await PDFDocument.load(file);
    const result = await PDFDocument.create();
    for (const index of keep) {
      const page = source.getPage(index);
      const items = (await (await proxy.getPage(index + 1)).getTextContent()).items.filter((i) => "transform" in i);
      const box = contentBox(items, page);
      const embedded = await result.embedPage(page, box);
      const w = box.right - box.left;
      const h = box.bottom < box.top ? box.top - box.bottom : 1;
      // 표가 가로로 길면 A4 가로 쪽에
      const size = w > h ? { w: A4.h, h: A4.w } : A4;
      const sx = (size.w - PAGE_MARGIN * 2) / w;
      const sy = (size.h - PAGE_MARGIN * 2) / h;
      // 비율을 지키며 키운 뒤, 한쪽이 남으면 그쪽으로 조금(최대 MAX_STRETCH 배) 더 늘려 쪽을 채움
      const scale = Math.min(sx, sy);
      const width = w * Math.min(sx, scale * MAX_STRETCH);
      const height = h * Math.min(sy, scale * MAX_STRETCH);
      const out = result.addPage([size.w, size.h]);
      out.drawPage(embedded, { x: (size.w - width) / 2, y: (size.h - height) / 2, width, height });
    }
    return await result.save();
  } catch (e) {
    console.error("PDF 에서 식단표 쪽을 고르지 못했어요", e);
    return null;
  }
}
