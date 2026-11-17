// 한글(HWP) 파일 읽기 도구: 쪽 모양 · 문단 · 표(칸 크기 · 안쪽 여백) · 한글이 저장해 둔 줄 나눔을 보여 주고,
// 화면(편집기)이 쓰는 줄 나누기 · 높이 계산이 한글과 같은지 견줌.
//
// 사용 (프로젝트 폴더에서):
//   npx tsx scripts/hwp-inspect.ts <파일.hwp> [--blocks] [--lines] [--json]
//     (옵션 없으면 --blocks)
//   --blocks  맨 위 문단 묶음마다 종류 · 글 · 표 크기와 줄마다 높이(한글이 저장한 값 / 계산한 값)
//   --lines   한글이 저장한 줄 나눔과 계산한 줄 나눔을 문단마다 견줌 (다른 문단만 보여 주고 맞은 비율을 알려 줌)
//   --json    위 결과를 JSON 으로
import { readFileSync } from "node:fs";
import { openHwp, subtreeEnd, tableCells, TAG, topParagraphs, type Rec } from "../src/lib/hwpEdit";
import { paraInfo } from "../src/lib/hwpLines";
import { charEm, textSize, lineStarts, pageDef, readMetrics, tableHeight, blockHeight, bodySize } from "../src/lib/hwpMeasure";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("사용법: npx tsx scripts/hwp-inspect.ts <파일.hwp> [--blocks] [--lines] [--json]");
  process.exit(1);
}
const flag = (n: string) => args.includes(`--${n}`);
const doc = openHwp(new Uint8Array(readFileSync(file)));
const recs: Rec[] = doc.recs;
const m = readMetrics(doc.cfb, doc.compressed);
const px = (u: number) => Math.round((u / 75) * 10) / 10; // 한글 단위 → 화면 px (96dpi)
const out: Record<string, unknown> = {};

const pd = pageDef(recs);
const body = bodySize(recs);
out.page = { width: px(pd.width), height: px(pd.height), left: px(pd.left), right: px(pd.right), top: px(pd.top), bottom: px(pd.bottom), bodyW: px(body.width), bodyH: px(body.height) };

/** 문단 하나: 글 · 한글이 저장한 줄 나눔과 계산한 줄 나눔 */
function para(p: number, width?: number) {
  const info = paraInfo(recs, p);
  const ps = m.para[info.paraShape];
  const cs = m.char[info.shapes[0]?.[1] ?? 0];
  const size = Math.max(...info.shapes.map(([, id]) => m.char[id]?.size ?? 1000), 500);
  const text = info.chars.map((c) => c.ch).join("");
  const em = (textSize(info.shapes, info.chars.length ? info.chars[info.chars.length - 1].pos + 1 : 0, m) * (cs?.ratio ?? 100)) / 100 * (1 + (cs?.spacing ?? 0) / 100);
  // 한글이 저장한 줄 시작(글자 번호)과 그 줄의 너비로 같은 규칙을 적용
  const hancom = info.segs.map((s) => info.chars.findIndex((c) => c.pos >= s.start)).map((i) => (i < 0 ? text.length : i));
  const w0 = info.segs[0]?.width ?? width ?? 0;
  const w1 = info.segs[1]?.width ?? w0;
  const mine = text ? lineStarts(text, w0, w1, em) : [0];
  return { text, size, ratio: cs?.ratio ?? 100, spacing: cs?.spacing ?? 0, ps, segs: info.segs, hancom, mine, em, w0, w1 };
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

if (flag("lines")) {
  let total = 0;
  let ok = 0;
  const bad: unknown[] = [];
  for (let i = 0; i < recs.length; i++) {
    if (recs[i].tag !== TAG.PARA_HEADER) continue;
    const r = para(i);
    if (!r.text.trim() || !r.segs.length) continue;
    total++;
    if (same(r.hancom, r.mine)) ok++;
    else {
      const cut = (a: number[]) => a.map((s, k) => r.text.slice(s, a[k + 1] ?? r.text.length)).join(" | ");
      bad.push({ rec: i, width: r.w0, em: Math.round(r.em), hancom: cut(r.hancom), mine: cut(r.mine) });
    }
  }
  out.lines = { total, same: ok, differ: total - ok, rate: total ? Math.round((ok / total) * 1000) / 10 : 0, bad };
}

if (flag("blocks") || (!flag("lines") && !flag("json"))) {
  const blocks: unknown[] = [];
  let used = 0;
  topParagraphs(recs).forEach(([s, e], bi) => {
    const hasTable = recs.slice(s, e).some((r) => r.tag === TAG.TABLE);
    const info = paraInfo(recs, s);
    if (!hasTable) {
      const r = para(s, body.width);
      const hHancom = info.segs.length ? info.segs[info.segs.length - 1].vpos + info.segs[info.segs.length - 1].height + info.segs[info.segs.length - 1].spacing - info.segs[0].vpos : null;
      blocks.push({ bi, type: "p", pageBreak: info.pageBreak, text: r.text.slice(0, 40), size: r.size / 100, ls: r.ps?.ls, hancomH: hHancom && px(hHancom), modelH: px(blockHeight(recs.slice(s, e), m, body.width)) });
      return;
    }
    const th = tableHeight(recs, s, e, m);
    const cells = tableCells(recs, s, e).map((c) => {
      const lh = recs[c.list].data;
      const paras = c.paras.map((p) => para(p, lh.readUInt32LE(16) - lh.readUInt16LE(24) - lh.readUInt16LE(26)));
      const lastSeg = paras.flatMap((x) => x.segs).at(-1);
      return { r: c.row, c: c.col, rs: c.rowSpan, cs: c.colSpan, w: px(lh.readUInt32LE(16)), h: px(lh.readUInt32LE(20)), margin: [lh.readUInt16LE(24), lh.readUInt16LE(26), lh.readUInt16LE(28), lh.readUInt16LE(30)].map(px), text: paras.map((x) => x.text).join("⏎").slice(0, 30), lines: paras.map((x) => `${x.hancom.length || "-"}/${x.mine.length}`).join(","), contentBottom: lastSeg && px(lastSeg.vpos + lastSeg.height + lastSeg.spacing) };
    });
    blocks.push({ bi, type: "table", rows: th.rows.map(px), modelH: px(th.height), cells: flag("cells") ? cells : cells.length });
    used += th.height;
  });
  out.blocks = blocks;
}

if (flag("json")) console.log(JSON.stringify(out, null, 1));
else {
  console.log("쪽:", JSON.stringify(out.page));
  if (out.lines) {
    const l = out.lines as { total: number; same: number; differ: number; rate: number; bad: unknown[] };
    console.log(`줄 나눔: 한글이 저장한 문단 ${l.total}개 중 계산과 같은 것 ${l.same}개 (${l.rate}%), 다른 것 ${l.differ}개`);
    for (const b of l.bad.slice(0, 40)) console.log(" ", JSON.stringify(b));
  }
  if (out.blocks) for (const b of out.blocks as object[]) console.log(JSON.stringify(b));
}
void charEm;
