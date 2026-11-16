import { paraCharShapes, subtreeEnd, TAG, type Rec } from "@/lib/hwpEdit";

/**
 * 한글이 파일에 저장해 둔 줄 나눔(PARA_LINE_SEG)을 읽음 (서버 · 스크립트 전용).
 * 한글이 직접 쪽을 나눈 결과라 줄 나누기를 어림하는 계산이 맞는지 견주는 정답으로 씀 (고친 문단은 한글이 열 때 다시 계산하므로 이 정보가 없음).
 * 단위는 모두 한글 단위(1/7200 인치 = 1pt 의 100분의 1).
 */

export type LineSeg = { start: number; vpos: number; height: number; textHeight: number; baseline: number; spacing: number; colStart: number; width: number };

/** 문단 글을 글자별로: pos 는 한글이 줄 나눔에 쓰는 글자 위치(확장 제어 문자는 8칸), ch 는 보이는 글자 (제어 문자는 빈 글자) */
export type RawChar = { pos: number; ch: string };

const CHAR_CONTROLS = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

export function rawChars(data: Buffer): RawChar[] {
  const out: RawChar[] = [];
  let pos = 0;
  for (let i = 0; i + 1 < data.length; i += 2) {
    const c = data.readUInt16LE(i);
    if (c >= 32) out.push({ pos, ch: String.fromCharCode(c) });
    else if (c === 10) out.push({ pos, ch: "\n" });
    if (c < 32 && !CHAR_CONTROLS.has(c)) {
      i += 14;
      pos += 8;
    } else pos += 1;
  }
  return out;
}

/** 문단(레코드 p)의 글과 줄 나눔 · 글자 모양 */
export function paraInfo(recs: Rec[], p: number) {
  const end = subtreeEnd(recs, p);
  const kids = recs.slice(p + 1, end).filter((r) => r.level === recs[p].level + 1);
  const text = kids.find((r) => r.tag === TAG.PARA_TEXT);
  const segData = kids.find((r) => r.tag === TAG.PARA_LINE_SEG)?.data;
  const segs: LineSeg[] = [];
  if (segData) {
    for (let o = 0; o + 36 <= segData.length; o += 36) {
      segs.push({
        start: segData.readUInt32LE(o),
        vpos: segData.readInt32LE(o + 4),
        height: segData.readInt32LE(o + 8),
        textHeight: segData.readInt32LE(o + 12),
        baseline: segData.readInt32LE(o + 16),
        spacing: segData.readInt32LE(o + 20),
        colStart: segData.readInt32LE(o + 24),
        width: segData.readInt32LE(o + 28),
      });
    }
  }
  return { chars: text ? rawChars(text.data) : [], segs, shapes: paraCharShapes(recs, p), paraShape: recs[p].data.readUInt16LE(8), pageBreak: recs[p].data.length > 11 && recs[p].data.readUInt8(11) & 0x05 ? 1 : 0 };
}
