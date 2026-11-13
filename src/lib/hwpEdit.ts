import { deflateRawSync, inflateRawSync } from "node:zlib";
import { CFB } from "xlsx";

/**
 * 한글(HWP 5.0) 문서를 고쳐 쓰는 작은 도구 (서버 · 스크립트 전용). 양식 파일을 바탕으로 칸에 글을 넣고 문단 묶음을 복사함.
 * 문서 구조: 한글 문서 파일 형식 5.0 (본문은 레코드의 나열이고, 레코드마다 종류 · 깊이 · 데이터가 있음).
 *
 * 글을 바꾼 문단은 줄 나눔 정보(PARA_LINE_SEG)를 지워 한글이 열 때 다시 계산하게 함.
 */

export const TAG = {
  PARA_HEADER: 66,
  PARA_TEXT: 67,
  PARA_CHAR_SHAPE: 68,
  PARA_LINE_SEG: 69,
  PARA_RANGE_TAG: 70,
  CTRL_HEADER: 71,
  LIST_HEADER: 72,
  TABLE: 77,
} as const;

export type Rec = { tag: number; level: number; data: Buffer };

export function parseRecords(buf: Buffer): Rec[] {
  const out: Rec[] = [];
  let o = 0;
  while (o + 4 <= buf.length) {
    const h = buf.readUInt32LE(o);
    o += 4;
    let size = h >>> 20;
    if (size === 0xfff) {
      size = buf.readUInt32LE(o);
      o += 4;
    }
    out.push({ tag: h & 0x3ff, level: (h >>> 10) & 0x3ff, data: Buffer.from(buf.subarray(o, o + size)) });
    o += size;
  }
  return out;
}

export function serializeRecords(recs: Rec[]): Buffer {
  const parts: Buffer[] = [];
  for (const r of recs) {
    const big = r.data.length >= 0xfff;
    const head = Buffer.alloc(big ? 8 : 4);
    head.writeUInt32LE(((r.tag & 0x3ff) | ((r.level & 0x3ff) << 10) | ((big ? 0xfff : r.data.length) << 20)) >>> 0, 0);
    if (big) head.writeUInt32LE(r.data.length, 4);
    parts.push(head, r.data);
  }
  return Buffer.concat(parts);
}

/** 레코드 i 의 하위 레코드가 끝나는 곳 (다음 형제 이상의 레코드 위치) */
export function subtreeEnd(recs: Rec[], i: number): number {
  let j = i + 1;
  while (j < recs.length && recs[j].level > recs[i].level) j++;
  return j;
}

/** 맨 위(깊이 0) 문단들의 [시작, 끝) 범위 */
export function topParagraphs(recs: Rec[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < recs.length; i++) if (recs[i].tag === TAG.PARA_HEADER && recs[i].level === 0) out.push([i, subtreeEnd(recs, i)]);
  return out;
}

// ---------------------------------------------------------------- 문단 글

/** 글자 하나 크기인 제어 문자 (나머지 제어 문자는 8글자 = 16바이트) */
const CHAR_CONTROLS = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

/** 문단 글 (확장 제어 문자는 빼고 읽음) */
export function readParaText(data: Buffer): string {
  let s = "";
  for (let i = 0; i + 1 < data.length; i += 2) {
    const c = data.readUInt16LE(i);
    if (c >= 32) s += String.fromCharCode(c);
    else if (c === 10) s += "\n";
    if (c < 32 && !CHAR_CONTROLS.has(c)) i += 14;
  }
  return s;
}

/** 글자 자리를 차지하지 않는 설정용 개체 (단 정의 · 구역 정의 등): 글을 바꿔도 그대로 문단 앞에 남겨 둠 */
const KEEP_CTRLS = new Set(["cold", "secd"]);

/**
 * 문단(PARA_HEADER 위치 p)의 글을 바꿈. 단 정의 같은 설정용 개체는 문단 앞에 그대로 남기고,
 * 표 · 그림처럼 내용이 있는 개체가 든 문단이면 바꾸지 않고 오류
 */
export function setParaText(recs: Rec[], p: number, text: string): void {
  const head = recs[p];
  if (head.tag !== TAG.PARA_HEADER) throw new Error("문단이 아니에요");
  const end = subtreeEnd(recs, p);
  const children = recs.slice(p + 1, end);
  // 남길 설정용 개체: 본문 속 제어 문자(8글자)와 CTRL_HEADER 묶음
  const keptCtrls: Rec[] = [];
  const keptMask: number[] = [];
  const keptUnits: Buffer[] = [];
  for (let i = 0; i < children.length; i++) {
    const r = children[i];
    if (r.tag !== TAG.CTRL_HEADER || r.level !== head.level + 1) continue;
    const id = Buffer.from(r.data.subarray(0, 4)).reverse().toString("latin1");
    if (!KEEP_CTRLS.has(id)) throw new Error(`개체(${id})가 든 문단은 글을 바꿀 수 없어요`);
    keptCtrls.push(...children.slice(i, subtreeEnd(children, i)));
  }
  const oldText = children.find((r) => r.tag === TAG.PARA_TEXT && r.level === head.level + 1);
  if (oldText) {
    for (let k = 0; k + 1 < oldText.data.length; k += 2) {
      const c = oldText.data.readUInt16LE(k);
      if (c < 32 && !CHAR_CONTROLS.has(c)) {
        keptUnits.push(Buffer.from(oldText.data.subarray(k, k + 16)));
        keptMask.push(c);
        k += 14;
      }
    }
  }
  const shape = children.find((r) => r.tag === TAG.PARA_CHAR_SHAPE);
  const shapeId = shape && shape.data.length >= 8 ? shape.data.readUInt32LE(4) : 0;

  const clean = text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/[\u0000-\u0009\u000b-\u001f]/g, "");
  const units: number[] = [];
  for (const ch of clean) {
    const code = ch === "\n" ? 10 : ch.codePointAt(0)!;
    if (code > 0xffff) {
      const v = code - 0x10000;
      units.push(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    } else units.push(code);
  }
  const next: Rec[] = [];
  const ctrlLen = keptUnits.length * 8; // 개체 하나가 글자 8개 자리
  if (units.length || keptUnits.length) {
    const t = Buffer.alloc((ctrlLen + units.length + 1) * 2);
    keptUnits.forEach((u, i) => u.copy(t, i * 16));
    units.forEach((u, i) => t.writeUInt16LE(u, (ctrlLen + i) * 2));
    t.writeUInt16LE(13, (ctrlLen + units.length) * 2);
    next.push({ tag: TAG.PARA_TEXT, level: head.level + 1, data: t });
  }
  const cs = Buffer.alloc(8);
  cs.writeUInt32LE(0, 0);
  cs.writeUInt32LE(shapeId, 4);
  next.push({ tag: TAG.PARA_CHAR_SHAPE, level: head.level + 1, data: cs });
  next.push(...keptCtrls);

  const h = Buffer.from(head.data);
  const lastFlag = h.readUInt32LE(0) & 0x80000000;
  h.writeUInt32LE((lastFlag | (ctrlLen + units.length + 1)) >>> 0, 0);
  // 들어 있는 제어 문자 (남긴 개체 · 줄 바꿈)
  h.writeUInt32LE((keptMask.reduce((m, c) => m | (1 << c), 0) | (units.includes(10) ? 1 << 10 : 0)) >>> 0, 4);
  h.writeUInt16LE(1, 12); // 글자 모양 1개
  h.writeUInt16LE(0, 14); // 영역 태그 없음
  h.writeUInt16LE(0, 16); // 줄 나눔 정보 없음 → 한글이 다시 계산
  recs.splice(p, end - p, { ...head, data: h }, ...next);
}

/** 문단의 마지막 문단 표시(목록 안 마지막 문단) */
export function setLastFlag(recs: Rec[], p: number, last: boolean) {
  const h = Buffer.from(recs[p].data);
  const n = h.readUInt32LE(0) & 0x7fffffff;
  h.writeUInt32LE((n | (last ? 0x80000000 : 0)) >>> 0, 0);
  recs[p] = { ...recs[p], data: h };
}

/** 문단 글 안에서 길이가 같은 글자만 바꿈 (글자 모양 위치가 그대로라 안전) */
export function replaceSameLength(recs: Rec[], p: number, find: RegExp, replace: (m: string) => string): boolean {
  const end = subtreeEnd(recs, p);
  for (let i = p + 1; i < end; i++) {
    const r = recs[i];
    if (r.tag !== TAG.PARA_TEXT || r.level !== recs[p].level + 1) continue;
    // 확장 제어 문자 자리는 그대로 두고, 글자 자리에만 맞춰 봄
    const chars: { at: number; ch: string }[] = [];
    for (let k = 0; k + 1 < r.data.length; k += 2) {
      const c = r.data.readUInt16LE(k);
      if (c >= 32) chars.push({ at: k, ch: String.fromCharCode(c) });
      if (c < 32 && !CHAR_CONTROLS.has(c)) k += 14;
    }
    const s = chars.map((c) => c.ch).join("");
    const m = find.exec(s);
    if (!m) return false;
    const to = replace(m[0]);
    if (to.length !== m[0].length) throw new Error("같은 길이로만 바꿀 수 있어요");
    const d = Buffer.from(r.data);
    for (let k = 0; k < to.length; k++) d.writeUInt16LE(to.charCodeAt(k), chars[m.index + k].at);
    recs[i] = { ...r, data: d };
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- 표

export type Cell = { row: number; col: number; rowSpan: number; colSpan: number; list: number; paras: number[] };

/** 문단 범위 [start, end) 안의 첫 번째 표와 그 칸들 (칸마다 LIST_HEADER 위치와 그 안의 문단 위치) */
export function tableCells(recs: Rec[], start: number, end: number): Cell[] {
  const t = recs.findIndex((r, i) => i >= start && i < end && r.tag === TAG.TABLE);
  if (t < 0) throw new Error("표가 없어요");
  const level = recs[t].level;
  const tEnd = (() => {
    let j = t + 1;
    while (j < end && recs[j].level >= level) j++;
    return j;
  })();
  const cells: Cell[] = [];
  for (let i = t + 1; i < tEnd; i++) {
    const r = recs[i];
    if (r.tag === TAG.LIST_HEADER && r.level === level) {
      cells.push({ col: r.data.readUInt16LE(8), row: r.data.readUInt16LE(10), colSpan: r.data.readUInt16LE(12) || 1, rowSpan: r.data.readUInt16LE(14) || 1, list: i, paras: [] });
    } else if (r.tag === TAG.PARA_HEADER && r.level === level && cells.length) cells[cells.length - 1].paras.push(i); // 칸 안의 문단은 LIST_HEADER 와 같은 깊이
  }
  return cells;
}

/** 칸의 문단을 앞의 keep 개만 남기고 지움 (칸의 문단 수와 마지막 문단 표시를 맞춤) */
export function trimCellParas(recs: Rec[], cell: Cell, keep: number) {
  if (cell.paras.length <= keep) return;
  const from = cell.paras[keep];
  const to = subtreeEnd(recs, cell.paras[cell.paras.length - 1]);
  recs.splice(from, to - from);
  const lh = Buffer.from(recs[cell.list].data);
  lh.writeInt16LE(keep, 0);
  recs[cell.list] = { ...recs[cell.list], data: lh };
  setLastFlag(recs, cell.paras[keep - 1], true);
}

// ---------------------------------------------------------------- 파일

export type HwpDoc = { cfb: ReturnType<typeof CFB.read>; recs: Rec[]; compressed: boolean };

export function openHwp(file: Uint8Array): HwpDoc {
  const cfb = CFB.read(file, { type: "buffer" });
  const header = CFB.find(cfb, "/FileHeader");
  if (!header) throw new Error("한글 문서가 아니에요");
  const flags = Buffer.from(header.content as Uint8Array).readUInt32LE(36);
  if (flags & 0b110) throw new Error("암호 · 배포용 문서는 고칠 수 없어요");
  const compressed = (flags & 1) === 1;
  const sec = CFB.find(cfb, "/BodyText/Section0");
  if (!sec) throw new Error("본문이 없어요");
  let body = Buffer.from(sec.content as Uint8Array);
  if (compressed) body = inflateRawSync(body);
  return { cfb, recs: parseRecords(body), compressed };
}

/** 본문 · 미리보기 글을 바꿔 한글 파일로 */
export function saveHwp(doc: HwpDoc, previewText: string): Buffer {
  // 맨 위 문단 중 마지막 것만 '마지막 문단' 표시
  const tops = topParagraphs(doc.recs);
  tops.forEach(([s], i) => setLastFlag(doc.recs, s, i === tops.length - 1));
  let body = serializeRecords(doc.recs);
  if (doc.compressed) body = deflateRawSync(body);
  const set = (path: string, content: Buffer) => {
    const e = CFB.find(doc.cfb, path);
    if (!e) return;
    e.content = content as unknown as typeof e.content;
    e.size = content.length;
  };
  set("/BodyText/Section0", body);
  const prv = Buffer.alloc((previewText.length + 1) * 2);
  for (let i = 0; i < previewText.length; i++) prv.writeUInt16LE(previewText.charCodeAt(i), i * 2);
  set("/PrvText", prv);
  // 미리보기 그림은 원본 첫 쪽 모습이라 개인정보가 보일 수 있으므로 1×1 흰 그림으로 바꿈
  set("/PrvImage", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC", "base64"));
  return Buffer.from(CFB.write(doc.cfb, { type: "buffer", fileType: "cfb" }) as Uint8Array);
}

/** 문단 묶음 복사본 (문단 · 개체의 고유 번호는 새로 매김) */
let nextInstance = 0x5a000000;
export function cloneRange(recs: Rec[], start: number, end: number): Rec[] {
  return recs.slice(start, end).map((r) => {
    const d = Buffer.from(r.data);
    if (r.tag === TAG.PARA_HEADER && d.length >= 22) d.writeUInt32LE(nextInstance++ >>> 0, 18);
    if (r.tag === TAG.CTRL_HEADER && d.length >= 40) {
      const id = d.subarray(0, 4).toString("latin1");
      if (id === " lbt" || id === " osg") d.writeUInt32LE(nextInstance++ >>> 0, 36); // 표 · 그림 개체
    }
    return { ...r, data: d };
  });
}
