import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";

/** PDF 로 올라온 급식 안내에서 식단표 쪽만 남김 (서버 전용). */

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

/** 식단표 쪽만 담은 PDF. 식단표 쪽을 찾지 못하거나 읽을 수 없으면 null */
export async function keepMealPages(file: Uint8Array): Promise<Uint8Array | null> {
  try {
    // pdf.js 가 넘겨받은 버퍼를 비워 버리므로 복사본을 줌
    const { text } = await extractText(await getDocumentProxy(file.slice()), { mergePages: false });
    const keep = mealPageIndexes(text);
    if (!keep.length) return null;
    const source = await PDFDocument.load(file);
    const result = await PDFDocument.create();
    for (const page of await result.copyPages(source, keep)) result.addPage(page);
    return await result.save();
  } catch (e) {
    console.error("PDF 에서 식단표 쪽을 고르지 못했어요", e);
    return null;
  }
}
