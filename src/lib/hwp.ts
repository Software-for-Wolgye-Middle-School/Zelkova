import { inflateRawSync } from "node:zlib";
import { CFB } from "xlsx";

/**
 * 한글(HWP 5.0) 문서에서 표만 읽어 냄 (서버 전용).
 * 문서 구조: https://www.hancom.com/etc/hwpDownload.do (한글 문서 파일 형식 5.0)
 */

export type HwpCell = { row: number; col: number; rowSpan: number; colSpan: number; lines: string[] };
export type HwpTable = { rows: number; cols: number; cells: HwpCell[] };

const TAG_PARA_TEXT = 67;
const TAG_LIST_HEADER = 72;
const TAG_TABLE = 77;

/** 글자 하나 크기인 제어 문자 (나머지 제어 문자는 8글자 = 16바이트를 차지) */
const CHAR_CONTROLS = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

function paraText(data: Buffer) {
  let text = "";
  for (let i = 0; i + 1 < data.length; i += 2) {
    const c = data.readUInt16LE(i);
    if (c >= 32) text += String.fromCharCode(c);
    else if (c === 13) text += "\n";
    else if (c === 9 || c === 30 || c === 31) text += " "; // 탭 · 묶음 빈칸 · 고정폭 빈칸
    if (c < 32 && !CHAR_CONTROLS.has(c)) i += 14;
  }
  return text;
}

type HwpRecord = { tag: number; level: number; data: Buffer };

function* records(buf: Buffer): Generator<HwpRecord> {
  let o = 0;
  while (o + 4 <= buf.length) {
    const h = buf.readUInt32LE(o);
    o += 4;
    let size = h >>> 20;
    if (size === 0xfff) {
      size = buf.readUInt32LE(o);
      o += 4;
    }
    yield { tag: h & 0x3ff, level: (h >>> 10) & 0x3ff, data: buf.subarray(o, o + size) };
    o += size;
  }
}

/** 문서 안의 모든 표 (표 안의 표도 따로 하나의 표로 돌려줌). 읽을 수 없는 문서면 null */
export function readHwpTables(file: Uint8Array): HwpTable[] | null {
  let cfb;
  try {
    cfb = CFB.read(file, { type: "buffer" });
  } catch {
    return null;
  }
  const header = CFB.find(cfb, "/FileHeader");
  if (!header) return null;
  const flags = Buffer.from(header.content).readUInt32LE(36);
  if (flags & 0b110) return null; // 암호 · 배포용 문서는 본문이 암호화되어 있음
  const compressed = (flags & 1) === 1;

  const sections = (cfb.FullPaths as string[])
    .map((path, i) => ({ n: Number(/\/BodyText\/Section(\d+)$/.exec(path)?.[1]), entry: cfb.FileIndex[i] }))
    .filter((s) => !Number.isNaN(s.n))
    .sort((a, b) => a.n - b.n);

  const tables: HwpTable[] = [];
  for (const { entry } of sections) {
    let body = Buffer.from(entry.content);
    if (compressed) body = inflateRawSync(body);

    // 셀(LIST_HEADER)은 표(TABLE) 레코드와 같은 깊이, 셀 안의 문단은 그보다 깊음
    const open: { level: number; table: HwpTable }[] = [];
    for (const rec of records(body)) {
      while (open.length && rec.level < open[open.length - 1].level) open.pop();
      const top = open[open.length - 1];
      if (rec.tag === TAG_TABLE && rec.data.length >= 8) {
        const table: HwpTable = { rows: rec.data.readUInt16LE(4), cols: rec.data.readUInt16LE(6), cells: [] };
        tables.push(table);
        open.push({ level: rec.level, table });
      } else if (rec.tag === TAG_LIST_HEADER && top && rec.level === top.level && rec.data.length >= 16) {
        top.table.cells.push({
          col: rec.data.readUInt16LE(8),
          row: rec.data.readUInt16LE(10),
          colSpan: rec.data.readUInt16LE(12) || 1,
          rowSpan: rec.data.readUInt16LE(14) || 1,
          lines: [],
        });
      } else if (rec.tag === TAG_PARA_TEXT && top && rec.level > top.level) {
        const cell = top.table.cells[top.table.cells.length - 1];
        cell?.lines.push(...paraText(rec.data).split("\n").map((l) => l.trim()).filter(Boolean));
      }
    }
  }
  return tables;
}
