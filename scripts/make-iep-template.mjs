// 학교에서 쓰는 개별화교육계획 한글 파일(학생 정보가 든 원본)에서 학생 한 명 분량의 양식만 떼어,
// 학생 정보를 모두 지운 빈 양식(public/templates/iep-template.hwp)을 만듦. 원본은 저장소에 넣지 않음.
//
// 사용: node --experimental-strip-types scripts/make-iep-template.mjs <원본.hwp> <만들 파일.hwp>
//
// 빈 양식의 맨 위 문단 순서 (src/lib/iepHwp.ts 가 이 순서를 씀):
//   0 첫 표지 줄(구역 정의 포함) · 1 표지 줄(둘째 학생부터) · 2~9 표지 · 10~14 인적 사항 · 교육활동 · 관련서비스
//   15 교과 표 · 16 월별 학습 표 · 17 일상생활적응 표 · 18 빈 줄
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const src = process.argv[2];
if (!src) {
  console.error("사용법: node --experimental-strip-types scripts/make-iep-template.mjs <원본.hwp>");
  process.exit(1);
}
const lib = await import(pathToFileURL(process.cwd() + "/src/lib/hwpEdit.ts").href);
const { openHwp, saveHwp, topParagraphs, tableCells, trimCellParas, setParaText } = lib;

const doc = openHwp(readFileSync(src));
const tops = topParagraphs(doc.recs);
// 원본에서 가져올 문단 (원본 문서의 학생 1 표지 · 인적 사항, 학생 2 의 영어 표(가장 반듯함), 학생 1 의 월별 · 일상생활 표)
const PICK = [0, 19, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 36, 16, 17, 18];
const recs = [];
for (const k of PICK) recs.push(...doc.recs.slice(tops[k][0], tops[k][1]).map((r) => ({ ...r, data: Buffer.from(r.data) })));
doc.recs = recs;

/** [빈 양식 문단 번호, [행, 열, 남길 문단 수, 지우기 시작할 문단]] */
const R = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const DATA = {
  6: [[0, 1], [0, 5], [0, 10], [1, 2], [1, 9], ...R(4, 9).flatMap((r) => [[r, 4], [r, 8]]), [10, 0]],
  11: [[0, 1], [1, 0], ...R(1, 5).map((r) => [r, 3])],
  12: [[2, 0], [2, 2], [2, 3], [2, 4], [3, 2], [3, 3], [3, 4]],
  13: [[2, 2], [2, 3], [2, 4], [3, 2], [3, 3], [3, 4], [4, 2], [4, 3], [4, 4], [5, 4], [6, 2], [6, 3], [6, 4]],
  14: [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]],
  15: [[0, 0], [0, 2, 2, 1], [1, 1], [2, 1], ...R(5, 16).flatMap((r) => [[r, 1], [r, 3], [r, 4], [r, 5], [r, 6]]), [18, 1], [19, 1]],
  16: [[0, 0], ...R(2, 5).flatMap((r) => [[r, 0], [r, 1], [r, 2], [r, 3]])],
  17: [[0, 2, 2, 1], [1, 1], [2, 1], ...R(5, 16).flatMap((r) => [[r, 1], [r, 3], [r, 4], [r, 5], [r, 6]]), [18, 1]],
};

for (const [para, cells] of Object.entries(DATA)) {
  for (const [row, col, keep = 1, clearFrom = 0] of cells) {
    const [s, e] = topParagraphs(doc.recs)[Number(para)];
    let cell = tableCells(doc.recs, s, e).find((c) => c.row === row && c.col === col);
    if (!cell) throw new Error(`문단 ${para} 의 표에 [${row}, ${col}] 칸이 없어요`);
    trimCellParas(doc.recs, cell, keep);
    const [s2, e2] = topParagraphs(doc.recs)[Number(para)];
    cell = tableCells(doc.recs, s2, e2).find((c) => c.row === row && c.col === col);
    for (let i = cell.paras.length - 1; i >= clearFrom; i--) {
      try {
        setParaText(doc.recs, cell.paras[i], "");
      } catch (e) {
        const p = cell.paras[i];
        const ctrls = doc.recs.slice(p + 1, lib.subtreeEnd(doc.recs, p)).filter((r) => r.tag === lib.TAG.CTRL_HEADER).map((r) => Buffer.from(r.data.subarray(0, 4)).reverse().toString("latin1"));
        throw new Error(`문단 ${para} 표 [${row}, ${col}] 칸: ${e.message} (개체: ${ctrls.join(", ")})`);
      }
    }
  }
}

// 먼저 임시 위치에 만들어 개인정보가 남지 않았는지 확인한 뒤 public/templates/iep-template.hwp 로 옮김
const dest = process.argv[3] ?? "iep-template.hwp";
const out = saveHwp(doc, "개별화교육계획");
writeFileSync(dest, out);
console.log(dest, out.length, "bytes");
