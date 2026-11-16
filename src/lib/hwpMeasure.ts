import { inflateRawSync, deflateRawSync } from "node:zlib";
import { CFB } from "xlsx";
import { paraCharShapes, parseRecords, readParaText, serializeRecords, subtreeEnd, tableCells, TAG, topParagraphs, type Rec } from "@/lib/hwpEdit";

/**
 * 한글 문서의 높이를 어림함 (서버 전용). 한글처럼 정확히 줄을 나누지는 못하지만, 글자 크기 · 줄 간격 · 칸 너비로
 * 줄 수를 넉넉하게(조금 많게) 세어, 한 쪽에 들어가는지 판단하는 데 씀. 단위는 모두 한글 단위(1/7200 인치, 1pt = 100).
 */

type ParaShape = { left: number; right: number; indent: number; top: number; bottom: number; lsType: number; ls: number };
type CharShape = { size: number; ratio: number; spacing: number };
/** para · char: 문단 · 글자 모양 (번호 순) · faces: 언어(한글 · 영문 · 한자 · 일어 · 기타 · 기호 · 사용자)마다 글꼴 이름 */
export type Metrics = { para: ParaShape[]; char: CharShape[]; paraShapeRecs: Rec[]; charShapeRecs: Rec[]; faces: string[][] };

const DOCINFO = "/DocInfo";
const TAG_PARA_SHAPE = 25;
const TAG_CHAR_SHAPE = 21;
const TAG_ID_MAPPINGS = 17;
const TAG_FACE_NAME = 19;
/** ID_MAPPINGS 안에서 개수 자리: 글자 모양 · 문단 모양 (그림 · 글꼴 7 · 테두리 다음) */
const ID_CHAR_SHAPES = 9;
const ID_PARA_SHAPES = 13;

function readDocInfo(cfb: ReturnType<typeof CFB.read>, compressed: boolean): Rec[] {
  const e = CFB.find(cfb, DOCINFO);
  let buf = Buffer.from((e?.content as Uint8Array) ?? []);
  if (compressed && buf.length) buf = inflateRawSync(buf);
  return parseRecords(buf);
}

function paraShapeOf(d: Buffer): ParaShape {
  // 5.0.2.5 이후 파일은 줄 간격을 뒤쪽(50)에 다시 적음 (종류는 attr3 의 아래 5비트)
  const late = d.length >= 54;
  return {
    left: d.readInt32LE(4),
    right: d.readInt32LE(8),
    indent: d.readInt32LE(12),
    top: d.readInt32LE(16),
    bottom: d.readInt32LE(20),
    lsType: late ? d.readUInt32LE(46) & 0x1f : d.readUInt32LE(0) & 3,
    ls: late ? d.readInt32LE(50) : d.readInt32LE(24),
  };
}
const charShapeOf = (d: Buffer): CharShape => ({ size: d.readInt32LE(42), ratio: d[14] || 100, spacing: d.readInt8(21) });

export function readMetrics(cfb: ReturnType<typeof CFB.read>, compressed: boolean): Metrics {
  const docInfo = readDocInfo(cfb, compressed);
  const paraShapeRecs = docInfo.filter((r) => r.tag === TAG_PARA_SHAPE);
  const charShapeRecs = docInfo.filter((r) => r.tag === TAG_CHAR_SHAPE && r.data.length >= 46);
  const idm = docInfo.find((r) => r.tag === TAG_ID_MAPPINGS)?.data;
  const counts = idm ? Array.from({ length: Math.floor(idm.length / 4) }, (_, i) => idm.readInt32LE(i * 4)) : [];
  const names = docInfo.filter((r) => r.tag === TAG_FACE_NAME && r.data.length >= 3).map((r) => r.data.toString("utf16le", 3, 3 + r.data.readUInt16LE(1) * 2));
  const faces: string[][] = [];
  let at = 0;
  for (let l = 0; l < 7; l++) {
    const n = counts[1 + l] ?? 0;
    faces.push(names.slice(at, at + n));
    at += n;
  }
  return { paraShapeRecs, charShapeRecs, faces, para: paraShapeRecs.map((r) => paraShapeOf(r.data)), char: charShapeRecs.map((r) => charShapeOf(r.data)) };
}

/** 줄 간격만 바꾼 문단 모양 (새 모양을 DocInfo 끝에 더할 때 씀) */
export function withLineSpacing(src: Buffer, ls: number): Buffer {
  const d = Buffer.from(src);
  if (d.length >= 54) d.writeInt32LE(ls, 50);
  d.writeInt32LE(ls, 24);
  return d;
}

/**
 * 문서 하나를 만들 때 더하는 글자 · 문단 모양 모음. 같은 모양은 한 번만 더하고, m 은 더한 모양까지 포함해 늘 최신.
 * 저장할 때 write 로 DocInfo 에 넣음 (번호는 원래 개수부터 차례로)
 */
export class ShapeBook {
  m: Metrics;
  private base: { para: number; char: number };
  private addedPara: Buffer[] = [];
  private addedChar: Buffer[] = [];
  private seen = new Map<string, number>();
  constructor(base: Metrics) {
    this.base = { para: base.para.length, char: base.char.length };
    this.m = { ...base, para: [...base.para], char: [...base.char] };
  }
  paraData(id: number) {
    return id < this.base.para ? this.m.paraShapeRecs[id]?.data : this.addedPara[id - this.base.para];
  }
  charData(id: number) {
    return id < this.base.char ? this.m.charShapeRecs[id]?.data : this.addedChar[id - this.base.char];
  }
  private add(kind: "p" | "c", data: Buffer) {
    const key = `${kind}:${data.toString("hex")}`;
    const had = this.seen.get(key);
    if (had !== undefined) return had;
    let id: number;
    if (kind === "p") {
      id = this.base.para + this.addedPara.length;
      this.addedPara.push(data);
      this.m.para.push(paraShapeOf(data));
    } else {
      id = this.base.char + this.addedChar.length;
      this.addedChar.push(data);
      this.m.char.push(charShapeOf(data));
    }
    this.seen.set(key, id);
    return id;
  }
  /** 줄 간격(%)만 바꾼 문단 모양 번호 */
  lineSpacing(from: number, ls: number) {
    const d = this.paraData(from);
    return d ? this.add("p", withLineSpacing(d, ls)) : from;
  }
  /** 글꼴(이름) · 크기(pt)를 바꾼 글자 모양 번호. 그 글꼴이 없는 언어는 원래 글꼴 그대로 */
  charVariant(from: number, o: { font?: string; size?: number; bold?: boolean }) {
    const src = this.charData(from);
    if (!src) return from;
    const d = Buffer.from(src);
    if (o.font) {
      for (let l = 0; l < 7; l++) {
        const i = this.m.faces[l]?.indexOf(o.font) ?? -1;
        if (i >= 0) d.writeUInt16LE(i, l * 2);
      }
    }
    if (o.size) d.writeInt32LE(Math.round(o.size * 100), 42);
    if (o.bold !== undefined && d.length >= 50) d.writeUInt32LE(((d.readUInt32LE(46) & ~2) | (o.bold ? 2 : 0)) >>> 0, 46);
    return d.equals(src) ? from : this.add("c", d);
  }
  get added() {
    return this.addedPara.length + this.addedChar.length;
  }
  /** 더한 모양을 문서 파일 묶음의 DocInfo 에 씀 */
  write(cfb: ReturnType<typeof CFB.read>, compressed: boolean) {
    if (!this.added) return;
    const recs = readDocInfo(cfb, compressed);
    const insertAfter = (tag: number, list: Buffer[]) => {
      if (!list.length) return;
      const last = recs.reduce((at, r, i) => (r.tag === tag ? i : at), -1);
      if (last < 0) throw new Error("모양 목록이 없는 문서예요");
      recs.splice(last + 1, 0, ...list.map((data) => ({ tag, level: recs[last].level, data })));
    };
    insertAfter(TAG_CHAR_SHAPE, this.addedChar);
    insertAfter(TAG_PARA_SHAPE, this.addedPara);
    const idm = recs.find((r) => r.tag === TAG_ID_MAPPINGS);
    if (!idm) throw new Error("ID_MAPPINGS 가 없는 문서예요");
    idm.data = Buffer.from(idm.data);
    idm.data.writeInt32LE(recs.filter((r) => r.tag === TAG_CHAR_SHAPE).length, ID_CHAR_SHAPES * 4);
    idm.data.writeInt32LE(recs.filter((r) => r.tag === TAG_PARA_SHAPE).length, ID_PARA_SHAPES * 4);
    let body = serializeRecords(recs);
    if (compressed) body = deflateRawSync(body);
    const e = CFB.find(cfb, DOCINFO);
    if (!e) throw new Error("DocInfo 가 없어요");
    e.content = body as unknown as typeof e.content;
    e.size = body.length;
  }
}

/** 글자 하나의 너비 (글자 크기의 몇 배인지). 한글 · 한자는 1, 영문 · 숫자는 0.58, 빈칸 · 문장부호는 0.4 (조금 넉넉하게) */
export function charEm(ch: string) {
  const c = ch.codePointAt(0) ?? 0;
  if (c >= 0x1100 && c <= 0x11ff) return 1;
  if (c >= 0x2e80) return 1;
  if (ch === " ") return 0.4;
  if (/[A-Za-z0-9]/.test(ch)) return 0.58;
  if (/[～~·•▪]/.test(ch)) return 1;
  return 0.42;
}

/** 줄 나누기를 어림함: 한글처럼 어절(빈칸) 단위로 넘기고, 너무 긴 어절은 글자 단위로. 줄마다 시작하는 글자 번호를 돌려줌 */
export function lineStarts(text: string, firstWidth: number, width: number, em: number) {
  const starts = [0];
  let room = firstWidth;
  let at = 0;
  for (const word of text.split(/(?<= )/)) {
    const chars = [...word];
    const w = chars.reduce((n, ch) => n + charEm(ch) * em, 0);
    const bare = w - (word.endsWith(" ") ? 0.4 * em : 0);
    if (bare <= room) {
      room -= w;
    } else if (bare <= width) {
      starts.push(at);
      room = width - w;
    } else {
      // 한 줄보다 긴 어절: 글자 단위로
      let i = at;
      for (const ch of chars) {
        const cw = charEm(ch) * em;
        if (cw > room) {
          starts.push(i);
          room = width;
        }
        room -= cw;
        i += ch.length;
      }
    }
    at += word.length;
  }
  return starts;
}

const countLines = (text: string, firstWidth: number, width: number, em: number) => lineStarts(text, firstWidth, width, em).length;

/** 문단 높이 (줄 수 × 줄 높이 + 문단 위아래 간격). width: 문단이 놓인 너비 */
export function paraHeight(recs: Rec[], p: number, width: number, m: Metrics, ls?: number) {
  const ps = m.para[recs[p].data.readUInt16LE(8)] ?? { left: 0, right: 0, indent: 0, top: 0, bottom: 0, lsType: 0, ls: 160 };
  const end = subtreeEnd(recs, p);
  const t = recs.slice(p + 1, end).find((r) => r.tag === TAG.PARA_TEXT && r.level === recs[p].level + 1);
  const text = t ? readParaText(t.data) : "";
  const shapes = paraCharShapes(recs, p);
  const size = Math.max(...shapes.map(([, id]) => m.char[id]?.size ?? 1000), 1000 * 0.5);
  const cs = m.char[shapes[0]?.[1] ?? 0];
  const em = size * ((cs?.ratio ?? 100) / 100) * (1 + (cs?.spacing ?? 0) / 100);
  const inner = width - ps.left - ps.right;
  // 들여쓰기(+)는 첫 줄만 좁게, 내어쓰기(-)는 첫 줄만 왼쪽으로 넓게
  const lines = text ? countLines(text, inner - ps.indent, inner, em) : 1;
  const spacing = ls ?? ps.ls;
  const lineH = ps.lsType === 1 ? spacing : ps.lsType === 2 ? size + spacing : ps.lsType === 3 ? Math.max(size, spacing) : (size * spacing) / 100;
  return lines * lineH + ps.top + ps.bottom;
}

/** 칸 안 글이 한 줄일 때의 높이 (문단마다 한 줄 + 칸 안 여백): 줄 높이를 글 한 줄에 맞출 때 씀 */
export function cellOneLineHeight(recs: Rec[], list: number, paras: number[], m: Metrics) {
  const lh = recs[list].data;
  const one = (p: number) => {
    const ps = m.para[recs[p].data.readUInt16LE(8)] ?? { left: 0, right: 0, indent: 0, top: 0, bottom: 0, lsType: 0, ls: 160 };
    const size = Math.max(...paraCharShapes(recs, p).map(([, id]) => m.char[id]?.size ?? 1000), 500);
    const lineH = ps.lsType === 1 ? ps.ls : ps.lsType === 2 ? size + ps.ls : ps.lsType === 3 ? Math.max(size, ps.ls) : (size * ps.ls) / 100;
    return lineH + ps.top + ps.bottom;
  };
  return paras.reduce((n, p) => n + one(p), 0) + lh.readUInt16LE(28) + lh.readUInt16LE(30);
}

/** 칸 안 글의 높이 (칸 안 여백 포함) */
export function cellContentHeight(recs: Rec[], list: number, paras: number[], m: Metrics, ls?: (p: number) => number | undefined) {
  const lh = recs[list].data;
  const width = lh.readUInt32LE(16) - lh.readUInt16LE(24) - lh.readUInt16LE(26);
  return paras.reduce((n, p) => n + paraHeight(recs, p, width, m, ls?.(p)), 0) + lh.readUInt16LE(28) + lh.readUInt16LE(30);
}

/** 표 높이 어림: 줄마다 (양식의 칸 높이, 칸 안 글 높이) 중 큰 것. 여러 줄을 합친 칸은 모자란 만큼 마지막 줄을 늘림 */
export function tableHeight(recs: Rec[], start: number, end: number, m: Metrics, ls?: (p: number) => number | undefined) {
  const t = recs.findIndex((r, i) => i >= start && i < end && r.tag === TAG.TABLE);
  if (t < 0) return { height: 0, rows: [] as number[] };
  const rowCount = recs[t].data.readUInt16LE(4);
  const rows = Array<number>(rowCount).fill(0);
  const cells = tableCells(recs, start, end).map((c) => ({ c, need: Math.max(recs[c.list].data.readUInt32LE(20), cellContentHeight(recs, c.list, c.paras, m, ls)) }));
  for (const { c, need } of cells) if (c.rowSpan === 1) rows[c.row] = Math.max(rows[c.row], need);
  for (const { c, need } of cells.filter((x) => x.c.rowSpan > 1).sort((a, b) => a.c.rowSpan - b.c.rowSpan)) {
    const last = Math.min(rowCount, c.row + c.rowSpan) - 1;
    const have = rows.slice(c.row, last + 1).reduce((n, x) => n + x, 0);
    if (need > have) rows[last] += need - have;
  }
  const ctrl = recs.slice(start, t).reverse().find((r) => r.tag === TAG.CTRL_HEADER);
  const outer = ctrl && ctrl.data.length >= 32 ? ctrl.data.readInt16LE(28) + ctrl.data.readInt16LE(30) : 0;
  return { height: rows.reduce((n, x) => n + x, 0) + outer, rows };
}

/** 맨 위 문단들의 높이 합 (표가 든 문단은 표 높이 + 문단 위아래 간격) */
export function blockHeight(recs: Rec[], m: Metrics, width: number, ls?: (p: number) => number | undefined) {
  return topParagraphs(recs).reduce((n, [s, e]) => {
    if (recs.slice(s, e).some((r) => r.tag === TAG.TABLE)) {
      const ps = m.para[recs[s].data.readUInt16LE(8)];
      const th = tableHeight(recs, s, e, m, ls);
      return n + th.height + (ps ? ps.top + ps.bottom : 0);
    }
    return n + paraHeight(recs, s, width, m);
  }, 0);
}

/** 본문이 놓이는 높이 · 너비 (쪽 크기에서 여백 · 머리말 · 꼬리말을 뺌) */
export function bodySize(recs: Rec[]) {
  const pd = recs.find((r) => r.tag === 73);
  if (!pd || pd.data.length < 32) return { width: 45354, height: 73700 };
  const v = (i: number) => pd.data.readUInt32LE(i * 4);
  return { width: v(0) - v(2) - v(3), height: v(1) - v(4) - v(5) - v(6) - v(7) };
}

/** 쪽 모양 (한글 단위): 크기와 본문 둘레 여백 (위 = 위 여백 + 머리말, 아래 = 아래 여백 + 꼬리말) */
export function pageDef(recs: Rec[]) {
  const pd = recs.find((r) => r.tag === 73);
  if (!pd || pd.data.length < 32) return { width: 59528, height: 84188, left: 7000, right: 7000, top: 5669, bottom: 4252 };
  const v = (i: number) => pd.data.readUInt32LE(i * 4);
  return { width: v(0), height: v(1), left: v(2), right: v(3), top: v(4) + v(6), bottom: v(5) + v(7) };
}
