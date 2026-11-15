import { inflateRawSync } from "node:zlib";
import { CFB } from "xlsx";
import { openHwp, parseRecords, type HwpDoc, readParaText, saveHwp, setParaText, subtreeEnd, tableCells, TAG, topParagraphs, trimCellParas, type Rec } from "@/lib/hwpEdit";

/**
 * 한글 양식 파일을 그대로 웹에서 고칠 수 있게 하는 도구 (서버 전용).
 *  - readForm: 양식의 문단과 표(칸 · 병합 · 너비 · 배경색 · 굵기 · 글자 크기 · 정렬)를 화면에 그릴 수 있는 모양으로 읽음
 *  - writeForm: 고친 글을 양식의 같은 문단 · 칸에 넣어 한글 파일로 만듦
 * 칸 이름: 맨 위 문단은 "p.<문단 번호>", 표 칸은 "c.<표 번호>.<행>.<열>" (양식 파일이 같으면 늘 같음)
 */

/** font: CSS 글꼴 목록(한글 글꼴 이름 먼저) · spacing: 자간(%) · color: 글자 색 */
/** fontName: 한글 글꼴 이름 (글꼴 고르기에 씀) · ls: 줄 간격(%, 글자 크기에 대한 비율) */
export type FormStyle = { align: "left" | "center" | "right" | "justify"; bold: boolean; size: number; font?: string; fontName?: string; spacing?: number; color?: string; ls?: number };
/** 칸 테두리 (왼쪽 · 오른쪽 · 위 · 아래), CSS border 값 */
export type FormBorder = [string, string, string, string];
export type FormCell = FormStyle & {
  key: string;
  r: number;
  c: number;
  rs: number;
  cs: number;
  w: number;
  h: number;
  bg: string | null;
  border?: FormBorder;
  valign: "top" | "middle" | "bottom";
  text: string;
  /** 칸 안 문단마다의 글 */
  lines: string[];
  /** 칸 안 문단마다의 모양 (문단마다 글꼴 · 크기 · 줄 간격이 다를 수 있음) */
  styles: FormStyle[];
  locked: boolean;
};
/** pi: 문서의 맨 위 문단 번호 · page: 이 문단에서 새 쪽이 시작됨 (조립할 때 붙임) */
export type FormBlock = { pi: number; page?: boolean } & (
  | (FormStyle & { type: "p"; key: string; text: string; locked: boolean })
  | { type: "table"; key: string; w: number; rows: number; cols: number; split: boolean; cells: FormCell[] }
  | { type: "object"; w: number; h: number; align: FormStyle["align"]; image: boolean }
);
/** 학생 한 명 분량 (label: 기본 이름 · nameKey: 학생 이름을 적는 칸) */
export type FormSection = { label: string; nameKey?: string; blocks: FormBlock[] };
export type Form = { sections: FormSection[] };

/** 한글 단위(1/7200 인치) → 화면 px (96dpi) */
const px = (hwp: number) => Math.round(hwp / 75);
const ALIGN: FormStyle["align"][] = ["justify", "left", "right", "center", "justify", "justify"];

type CharStyle = { bold: boolean; size: number; font?: string; fontName?: string; spacing?: number; color?: string };
type Shapes = { para: { align: FormStyle["align"]; ls?: number }[]; char: CharStyle[]; fill: (string | null)[]; border: FormBorder[] };

/** 한글 색 값(0x00BBGGRR) → #rrggbb */
const hexColor = (c: number) => `#${[c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
/** 선 굵기 번호 → mm (한글 표 테두리 굵기 목록) */
const LINE_MM = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
/** 선 종류 번호 → CSS (0 없음 · 1 실선 · 2 긴 점선 · 3 점선 · 4~6 점선류 · 7 원형 점선 · 8~10 이중선 · 11~ 실선) */
function lineCss(type: number, width: number, color: number) {
  if (!type) return "none";
  const style = type === 3 || type === 7 ? "dotted" : type === 2 || (type >= 4 && type <= 6) ? "dashed" : type >= 8 && type <= 10 ? "double" : "solid";
  const mm = LINE_MM[width] ?? 0.12;
  const w = style === "double" ? 3 : mm >= 0.3 ? Math.max(2, Math.round(mm * 3.78)) : 1;
  return `${w}px ${style} ${hexColor(color)}`;
}
/** 글꼴 이름 → CSS 글꼴 목록 (선생님 컴퓨터에 한글 글꼴이 있으면 그대로, 없으면 비슷한 글꼴) */
function fontCss(hangul: string | undefined, latin: string | undefined) {
  const names = [...new Set([hangul, latin].filter((x): x is string => !!x))];
  const serif = names.some((n) => /바탕|명조|Batang|Myeongjo/i.test(n));
  return [...names.map((n) => `"${n.replace(/"/g, "")}"`), serif ? '"Batang", "AppleMyungjo", serif' : '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif'].join(", ");
}

/** 문서 정보(DocInfo)에서 문단 정렬 · 글자 모양(글꼴 · 굵기 · 크기 · 자간 · 색) · 칸 배경색 · 테두리 목록 */
function readShapes(cfb: ReturnType<typeof CFB.read>, compressed: boolean): Shapes {
  const e = CFB.find(cfb, "/DocInfo");
  let buf = Buffer.from((e?.content as Uint8Array) ?? []);
  if (compressed && buf.length) buf = inflateRawSync(buf);
  const out: Shapes = { para: [], char: [], fill: [], border: [] };
  const recs = parseRecords(buf);
  // 글꼴 이름은 언어(한글 · 영문 · …)마다 차례로 들어 있음: 앞의 두 묶음만 씀
  const idm = recs.find((r) => r.tag === 17)?.data;
  const counts = idm ? Array.from({ length: Math.floor(idm.length / 4) }, (_, i) => idm.readInt32LE(i * 4)) : [];
  const faces = recs.filter((r) => r.tag === 19 && r.data.length >= 3).map((r) => r.data.toString("utf16le", 3, 3 + r.data.readUInt16LE(1) * 2));
  const hangul = faces.slice(0, counts[1] ?? 0);
  const latin = faces.slice(counts[1] ?? 0, (counts[1] ?? 0) + (counts[2] ?? 0));
  for (const r of recs) {
    if (r.tag === 25 && r.data.length >= 4) {
      // 줄 간격: 5.0.2.5 이후는 뒤쪽(50, 종류는 attr3 아래 5비트), 그전은 24 (종류 0 = 글자 크기에 대한 %)
      const late = r.data.length >= 54;
      const lsType = late ? r.data.readUInt32LE(46) & 0x1f : r.data.readUInt32LE(0) & 3;
      const ls = r.data.length >= 28 ? (late ? r.data.readInt32LE(50) : r.data.readInt32LE(24)) : 0;
      out.para.push({ align: ALIGN[(r.data.readUInt32LE(0) >> 2) & 7] ?? "justify", ls: lsType === 0 && ls > 0 ? ls : undefined });
    }
    if (r.tag === 21 && r.data.length >= 56) {
      const color = r.data.readUInt32LE(52);
      out.char.push({
        size: r.data.readInt32LE(42) / 100,
        bold: (r.data.readUInt32LE(46) & 2) !== 0,
        font: fontCss(hangul[r.data.readUInt16LE(0)], latin[r.data.readUInt16LE(2)]),
        fontName: hangul[r.data.readUInt16LE(0)],
        spacing: r.data.readInt8(21) || undefined,
        color: color && color !== 0xffffffff ? hexColor(color) : undefined,
      });
    }
    if (r.tag === 20 && r.data.length >= 40) {
      const type = r.data.readUInt32LE(32);
      const c = r.data.readUInt32LE(36);
      const hex = hexColor(c);
      out.fill.push(type & 1 && c !== 0xffffffff && hex !== "#ffffff" ? hex : null);
      const side = (i: number) => lineCss(r.data[2 + i * 6], r.data[3 + i * 6], r.data.readUInt32LE(4 + i * 6));
      out.border.push([side(0), side(1), side(2), side(3)]);
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
  const ch: CharStyle = shapes.char[cs && cs.data.length >= 8 ? cs.data.readUInt32LE(4) : 0] ?? { bold: false, size: 10 };
  const obj = kids.find((r) => r.tag === TAG.CTRL_HEADER && Buffer.from(r.data.subarray(0, 4)).reverse().toString("latin1") === "gso ");
  return {
    text: text ? readParaText(text.data) : "",
    align: shapes.para[recs[p].data.readUInt16LE(8)]?.align ?? "justify",
    ls: shapes.para[recs[p].data.readUInt16LE(8)]?.ls,
    ...ch,
    object: ctrls.some((c) => c !== "cold" && c !== "secd"),
    /** 그림 개체의 크기, 그 안에 그림(SHAPE_COMPONENT_PICTURE)이 들었는지 */
    gso: obj && obj.data.length >= 24 ? { w: px(obj.data.readUInt32LE(16)), h: px(obj.data.readUInt32LE(20)), image: recs.slice(p + 1, end).some((r) => r.tag === 85) } : undefined,
  };
}

/** 양식 문서를 화면에 그릴 모양으로. 학생마다(표지의 "○○학년도 ○학기" 줄마다) 나눔 */
/** 양식 파일을 화면에 그릴 모양으로 */
export const readForm = (template: Uint8Array): Form => readFormDoc(openHwp(template));

/** 열어 둔 한글 문서를 화면에 그릴 모양으로. 학생마다(표지의 "○○학년도 ○학기" 줄마다) 나눔 */
export function readFormDoc(doc: HwpDoc): Form {
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
        const first: FormStyle = parts[0] ?? { align: "justify", bold: false, size: 10 };
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
          border: fillId > 0 ? shapes.border[fillId - 1] : undefined,
          valign: (["top", "middle", "bottom"] as const)[(lh.readUInt32LE(2) >> 21) & 3] ?? "middle", // 칸 속성 21~22번째 비트
          text: parts.map((x) => x.text).join("\n"),
          lines: parts.map((x) => x.text),
          styles: parts.map((x): FormStyle => ({ align: x.align, bold: x.bold, size: x.size, font: x.font, fontName: x.fontName, spacing: x.spacing, color: x.color, ls: x.ls })),
          ls: first.ls,
          fontName: first.fontName,
          align: first.align,
          bold: first.bold,
          size: first.size,
          font: first.font,
          spacing: first.spacing,
          color: first.color,
          locked: parts.some((x) => x.object), // 칸 안에 표 · 그림이 있으면 글만 바꾸면 깨지므로 잠금
        };
      });
      // split: 쪽 경계에서 나눌 수 있는 표 (표 속성 아래 2비트, 0 = 나누지 않음)
      blocks.push({ type: "table", pi, key: `t.${no}`, w: ctrl && ctrl.data.length >= 20 ? px(ctrl.data.readUInt32LE(16)) : 680, rows: recs[t].data.readUInt16LE(4), cols: recs[t].data.readUInt16LE(6), split: (recs[t].data.readUInt32LE(0) & 3) !== 0, cells });
    } else if (info.object) {
      blocks.push({ type: "object", pi, w: info.gso?.w ?? 0, h: info.gso?.h ?? 0, align: info.align, image: !!info.gso?.image });
    } else {
      blocks.push({ type: "p", pi, key: `p.${pi}`, text: info.text, align: info.align, bold: info.bold, size: info.size, font: info.font, spacing: info.spacing, color: info.color, locked: false });
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

/** 양식에 든 첫 그림(BinData, 예: 학교 로고)과 그 종류. 압축돼 있으면 풀어서 */
export function readFormImage(template: Uint8Array): { data: Buffer; type: string } | null {
  const cfb = CFB.read(Buffer.from(template), { type: "buffer" });
  const path = cfb.FullPaths.find((p: string) => /\/BinData\/BIN[0-9A-F]+\.\w+$/i.test(p));
  const entry = path ? CFB.find(cfb, path) : null;
  if (!path || !entry?.content) return null;
  let data = Buffer.from(entry.content as Uint8Array);
  const ext = path.split(".").pop()!.toLowerCase();
  const magic: Record<string, (b: Buffer) => boolean> = {
    bmp: (b) => b.subarray(0, 2).toString("latin1") === "BM",
    png: (b) => b[0] === 0x89 && b.subarray(1, 4).toString("latin1") === "PNG",
    jpg: (b) => b[0] === 0xff && b[1] === 0xd8,
    jpeg: (b) => b[0] === 0xff && b[1] === 0xd8,
    gif: (b) => b.subarray(0, 3).toString("latin1") === "GIF",
  };
  const looks = magic[ext];
  if (!looks) return null;
  if (!looks(data)) {
    try {
      data = inflateRawSync(data);
    } catch {
      return null;
    }
    if (!looks(data)) return null;
  }
  return { data, type: `image/${ext === "jpg" ? "jpeg" : ext}` };
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
