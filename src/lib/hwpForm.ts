import { inflateRawSync } from "node:zlib";
import { CFB } from "xlsx";
import { openHwp, parseRecords, readParaText, saveHwp, setParaText, subtreeEnd, tableCells, TAG, topParagraphs, trimCellParas, type Rec } from "@/lib/hwpEdit";

/**
 * 한글 양식 파일을 그대로 웹에서 고칠 수 있게 하는 도구 (서버 전용).
 *  - readForm: 양식의 문단과 표(칸 · 병합 · 너비 · 배경색 · 굵기 · 글자 크기 · 정렬)를 화면에 그릴 수 있는 모양으로 읽음
 *  - writeForm: 고친 글을 양식의 같은 문단 · 칸에 넣어 한글 파일로 만듦
 * 칸 이름: 맨 위 문단은 "p.<문단 번호>", 표 칸은 "c.<표 번호>.<행>.<열>" (양식 파일이 같으면 늘 같음)
 */

export type FormStyle = { align: "left" | "center" | "right" | "justify"; bold: boolean; size: number };
export type FormCell = FormStyle & { key: string; r: number; c: number; rs: number; cs: number; w: number; h: number; bg: string | null; valign: "top" | "middle" | "bottom"; text: string; locked: boolean };
export type FormBlock =
  | (FormStyle & { type: "p"; key: string; text: string; locked: boolean })
  | { type: "table"; key: string; w: number; rows: number; cols: number; cells: FormCell[] }
  | { type: "object" };
/** 학생 한 명 분량 (label: 기본 이름 · nameKey: 학생 이름을 적는 칸) */
export type FormSection = { label: string; nameKey?: string; blocks: FormBlock[] };
export type Form = { sections: FormSection[] };

/** 한글 단위(1/7200 인치) → 화면 px (96dpi) */
const px = (hwp: number) => Math.round(hwp / 75);
const ALIGN: FormStyle["align"][] = ["justify", "left", "right", "center", "justify", "justify"];

type Shapes = { para: FormStyle["align"][]; char: { bold: boolean; size: number }[]; fill: (string | null)[] };

/** 문서 정보(DocInfo)에서 문단 정렬 · 글자 굵기 · 크기 · 칸 배경색 목록 */
function readShapes(cfb: ReturnType<typeof CFB.read>, compressed: boolean): Shapes {
  const e = CFB.find(cfb, "/DocInfo");
  let buf = Buffer.from((e?.content as Uint8Array) ?? []);
  if (compressed && buf.length) buf = inflateRawSync(buf);
  const out: Shapes = { para: [], char: [], fill: [] };
  for (const r of parseRecords(buf)) {
    if (r.tag === 25 && r.data.length >= 4) out.para.push(ALIGN[(r.data.readUInt32LE(0) >> 2) & 7] ?? "justify");
    if (r.tag === 21 && r.data.length >= 50) out.char.push({ size: r.data.readInt32LE(42) / 100, bold: (r.data.readUInt32LE(46) & 2) !== 0 });
    if (r.tag === 20 && r.data.length >= 40) {
      const type = r.data.readUInt32LE(32);
      const c = r.data.readUInt32LE(36);
      const hex = `#${[c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      out.fill.push(type & 1 && c !== 0xffffffff && hex !== "#ffffff" ? hex : null);
    }
  }
  return out;
}

/** 문단(PARA_HEADER 위치 p)의 글 · 모양, 그리고 내용이 있는 개체(표 · 그림)가 들었는지 */
function paraInfo(recs: Rec[], p: number, shapes: Shapes) {
  const end = subtreeEnd(recs, p);
  const kids = recs.slice(p + 1, end).filter((r) => r.level === recs[p].level + 1);
  const text = kids.find((r) => r.tag === TAG.PARA_TEXT);
  const cs = kids.find((r) => r.tag === TAG.PARA_CHAR_SHAPE);
  const ctrls = kids.filter((r) => r.tag === TAG.CTRL_HEADER).map((r) => Buffer.from(r.data.subarray(0, 4)).reverse().toString("latin1"));
  const ch = shapes.char[cs && cs.data.length >= 8 ? cs.data.readUInt32LE(4) : 0] ?? { bold: false, size: 10 };
  return {
    text: text ? readParaText(text.data) : "",
    align: shapes.para[recs[p].data.readUInt16LE(8)] ?? "justify",
    bold: ch.bold,
    size: ch.size,
    object: ctrls.some((c) => c !== "cold" && c !== "secd"),
  };
}

/** 양식 문서를 화면에 그릴 모양으로. 학생마다(표지의 "○○학년도 ○학기" 줄마다) 나눔 */
export function readForm(template: Uint8Array): Form {
  const doc = openHwp(template);
  const shapes = readShapes(doc.cfb, doc.compressed);
  const recs = doc.recs;
  const sections: FormSection[] = [];
  let tableNo = 0;
  topParagraphs(recs).forEach(([s, e], pi) => {
    const t = recs.findIndex((r, i) => i > s && i < e && r.tag === TAG.TABLE);
    const info = paraInfo(recs, s, shapes);
    // 표지 첫 줄(예: "2026학년도 2학기")에서 새 학생이 시작됨
    if (!sections.length || (t < 0 && /^\s*\d{4}\s*학년도\s*\d\s*학기\s*$/.test(info.text))) sections.push({ label: `학생 ${sections.length + 1}`, blocks: [] });
    const blocks = sections[sections.length - 1].blocks;
    if (t >= 0) {
      const no = tableNo++;
      const ctrl = recs.slice(s, t).reverse().find((r) => r.tag === TAG.CTRL_HEADER);
      const cells: FormCell[] = tableCells(recs, s, e).map((c) => {
        const lh = recs[c.list].data;
        const parts = c.paras.map((p) => paraInfo(recs, p, shapes));
        const first = parts[0] ?? { align: "justify" as const, bold: false, size: 10, text: "", object: false };
        const fillId = lh.length >= 34 ? lh.readUInt16LE(32) : 0;
        return {
          key: `c.${no}.${c.row}.${c.col}`,
          r: c.row,
          c: c.col,
          rs: c.rowSpan,
          cs: c.colSpan,
          w: px(lh.readUInt32LE(16)),
          h: px(lh.readUInt32LE(20)),
          bg: fillId > 0 ? (shapes.fill[fillId - 1] ?? null) : null,
          valign: (["top", "middle", "bottom"] as const)[(lh.readUInt32LE(2) >> 21) & 3] ?? "middle", // 칸 속성 21~22번째 비트
          text: parts.map((x) => x.text).join("\n"),
          align: first.align,
          bold: first.bold,
          size: first.size,
          locked: parts.some((x) => x.object), // 칸 안에 표 · 그림이 있으면 글만 바꾸면 깨지므로 잠금
        };
      });
      blocks.push({ type: "table", key: `t.${no}`, w: ctrl && ctrl.data.length >= 20 ? px(ctrl.data.readUInt32LE(16)) : 680, rows: recs[t].data.readUInt16LE(4), cols: recs[t].data.readUInt16LE(6), cells });
    } else if (info.object) {
      blocks.push({ type: "object" });
    } else {
      blocks.push({ type: "p", key: `p.${pi}`, text: info.text, align: info.align, bold: info.bold, size: info.size, locked: false });
    }
  });
  // 학생 이름 칸: 표지 표의 '학생명' 칸 바로 오른쪽 칸 (화면의 학생 단추에 그 칸에 적은 이름을 보여 줌)
  for (const sec of sections) {
    const t = sec.blocks.find((b): b is Extract<FormBlock, { type: "table" }> => b.type === "table");
    const label = t?.cells.find((c) => c.text.replace(/\s/g, "") === "학생명");
    const value = label && t?.cells.find((c) => c.r === label.r && c.c === label.c + label.cs);
    if (value) sec.nameKey = value.key;
  }
  return { sections };
}

/** 고친 글(칸 이름 → 글)을 양식의 같은 자리에 넣어 한글 파일로. 안 고친 칸은 양식 그대로 */
export function writeForm(template: Uint8Array, values: Record<string, string>, previewTitle: string): Buffer {
  const doc = openHwp(template);
  const tops = topParagraphs(doc.recs);
  // 뒤에서부터 고쳐야 앞쪽 레코드 위치가 바뀌지 않음
  const tables: { no: number; s: number; e: number }[] = [];
  let no = 0;
  tops.forEach(([s, e]) => {
    if (doc.recs.slice(s, e).some((r) => r.tag === TAG.TABLE)) tables.push({ no: no++, s, e });
  });
  const edits: { at: number; run: () => void }[] = [];
  for (const t of tables) {
    for (const cell of tableCells(doc.recs, t.s, t.e)) {
      const v = values[`c.${t.no}.${cell.row}.${cell.col}`];
      if (v === undefined || !cell.paras.length) continue;
      edits.push({
        at: cell.list,
        run: () => {
          // 표 문단의 시작 위치는 그대로(뒤쪽부터 고치므로), 끝은 고친 만큼 바뀌어 다시 셈
          const fresh = tableCells(doc.recs, t.s, subtreeEnd(doc.recs, t.s)).find((c) => c.row === cell.row && c.col === cell.col);
          if (!fresh) return;
          trimCellParas(doc.recs, fresh, 1);
          setParaText(doc.recs, fresh.paras[0], v);
        },
      });
    }
  }
  tops.forEach(([s], pi) => {
    const v = values[`p.${pi}`];
    if (v !== undefined) edits.push({ at: s, run: () => setParaText(doc.recs, s, v) });
  });
  for (const ed of edits.sort((a, b) => b.at - a.at)) {
    try {
      ed.run();
    } catch (e) {
      console.error("양식 칸을 고치지 못했어요 (그대로 둠)", e instanceof Error ? e.message : e);
    }
  }
  return saveHwp(doc, previewTitle);
}
