#!/usr/bin/env node
// 한글(HWP 5.0) 파일을 형식을 깨뜨리지 않고 읽고 · 고치는 명령줄 도구.
// 쓰는 법: node --experimental-strip-types scripts/hwp.mjs <명령> <파일.hwp> [옵션]
//
// 읽기
//   info     <파일>                          파일 정보 (스트림 · 판 · 압축 · 문단 · 표 수)
//   paras    <파일>                          맨 위 문단 목록 (번호 · 쪽나눔 · 개체 · 표 번호 · 글)
//   table    <파일> <표 번호>                 표의 칸 (행 · 열 · 병합 · 글)
//   get      <파일> c.<표>.<행>.<열> | p.<문단> 칸 · 문단의 글
//   verify   <파일>                          한글이 열 수 있는 구조인지 검사 (문단 · 칸 · 표)
// 고치기 (결과는 -o <새 파일> 에 씀. 쓰기 전에 구조를 검사해 문제가 있으면 쓰지 않음)
//   set      <파일> c.<표>.<행>.<열>|p.<문단> <글> -o <새 파일>      글 바꾸기 (\n 으로 줄 바꿈)
//   add-row  <파일> <표 번호> <행> [개수] -o <새 파일>                행 아래에 같은 모양의 빈 줄 더하기
//   del-row  <파일> <표 번호> <행> -o <새 파일>                      줄 빼기
//   copy     <파일> <시작 문단> <끝 문단> <넣을 문단 앞> -o <새 파일>  문단 묶음(표 포함) 복사해 끼우기
//   delete   <파일> <시작 문단> <끝 문단> -o <새 파일>                문단 묶음 지우기
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const lib = await import(pathToFileURL(new URL("../src/lib/hwpEdit.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href);
const { openHwp, saveHwp, topParagraphs, tableCells, readParaText, setParaText, setCellText, insertTableRows, deleteTableRow, cloneRange, verifyRecords, subtreeEnd, TAG } = lib;

const [cmd, file, ...rest] = process.argv.slice(2);
const outIdx = rest.indexOf("-o");
const out = outIdx >= 0 ? rest[outIdx + 1] : null;
const args = outIdx >= 0 ? rest.slice(0, outIdx) : rest;
const die = (m) => {
  console.error(m);
  process.exit(1);
};
if (!cmd || !file) die("쓰는 법은 scripts/hwp.mjs 맨 위 설명을 보세요.");

const doc = openHwp(readFileSync(file));
const tops = () => topParagraphs(doc.recs);
/** 표 번호 → 그 표가 든 맨 위 문단 [시작, 끝) */
const tableParas = () => tops().filter(([s, e]) => doc.recs.slice(s, e).some((r) => r.tag === TAG.TABLE));
const paraText = (p) => {
  const t = doc.recs.slice(p + 1, subtreeEnd(doc.recs, p)).find((r) => r.tag === TAG.PARA_TEXT && r.level === doc.recs[p].level + 1);
  return t ? readParaText(t.data) : "";
};
const cellOf = (key) => {
  const [, t, r, c] = key.split(".").map(Number);
  const range = tableParas()[t];
  if (!range) die(`표 ${t} 이 없어요`);
  const cell = tableCells(doc.recs, range[0], range[1]).find((x) => x.row === r && x.col === c);
  if (!cell) die(`표 ${t} 에 [${r}, ${c}] 칸이 없어요`);
  return cell;
};
const save = () => {
  if (!out) die("-o <새 파일> 을 적어 주세요");
  const problems = verifyRecords(doc.recs);
  if (problems.length) die(`구조에 문제가 있어 쓰지 않았어요:\n${problems.slice(0, 20).join("\n")}`);
  writeFileSync(out, saveHwp(doc, "개별화교육계획"));
  console.log(`썼어요: ${out}`);
};

switch (cmd) {
  case "info": {
    const ts = tableParas();
    console.log(`문단 ${tops().length}개 · 표 ${ts.length}개 · 레코드 ${doc.recs.length}개 · 압축 ${doc.compressed}`);
    console.log(`스트림: ${doc.cfb.FullPaths.filter((p) => !p.endsWith("/")).join(", ")}`);
    break;
  }
  case "paras": {
    let tno = 0;
    tops().forEach(([s, e], i) => {
      const ctrls = doc.recs.slice(s, e).filter((r) => r.tag === TAG.CTRL_HEADER && r.level === 1).map((r) => Buffer.from(r.data.subarray(0, 4)).reverse().toString("latin1").trim());
      const tables = doc.recs.slice(s, e).filter((r) => r.tag === TAG.TABLE).map(() => tno++);
      console.log(`p.${i}\t${ctrls.join(",") || "-"}\t${tables.length ? `표 ${tables.join(",")}` : ""}\t${paraText(s).replace(/\n/g, "⏎").slice(0, 60)}`);
    });
    break;
  }
  case "table": {
    const range = tableParas()[Number(args[0])];
    if (!range) die(`표 ${args[0]} 이 없어요`);
    for (const c of tableCells(doc.recs, range[0], range[1])) console.log(`c.${args[0]}.${c.row}.${c.col}\t${c.rowSpan}x${c.colSpan}\t${c.paras.map(paraText).join("⏎").slice(0, 80)}`);
    break;
  }
  case "get": {
    const key = args[0];
    if (key.startsWith("p.")) console.log(paraText(tops()[Number(key.slice(2))][0]));
    else console.log(cellOf(key).paras.map(paraText).join("\n"));
    break;
  }
  case "verify": {
    const problems = verifyRecords(doc.recs);
    console.log(problems.length ? problems.slice(0, 50).join("\n") : "구조 문제 없음");
    process.exit(problems.length ? 1 : 0);
  }
  case "set": {
    const [key, text] = args;
    const value = (text ?? "").replace(/\\n/g, "\n");
    if (key.startsWith("p.")) setParaText(doc.recs, tops()[Number(key.slice(2))][0], value);
    // 칸은 한 줄씩 칸의 문단에 차례로 넣음 (문단 수 · 모양 · 칸 높이 그대로)
    else setCellText(doc.recs, cellOf(key), value);
    save();
    break;
  }
  case "add-row":
  case "del-row": {
    const range = tableParas()[Number(args[0])];
    if (!range) die(`표 ${args[0]} 이 없어요`);
    if (cmd === "add-row") insertTableRows(doc.recs, range[0], range[1], Number(args[1]), Number(args[2] ?? 1));
    else deleteTableRow(doc.recs, range[0], range[1], Number(args[1]));
    save();
    break;
  }
  case "copy": {
    const [from, to, before] = args.map(Number);
    const t = tops();
    const piece = cloneRange(doc.recs, t[from][0], t[to][1]);
    doc.recs.splice(t[before] ? t[before][0] : doc.recs.length, 0, ...piece);
    save();
    break;
  }
  case "delete": {
    const [from, to] = args.map(Number);
    const t = tops();
    doc.recs.splice(t[from][0], t[to][1] - t[from][0]);
    save();
    break;
  }
  default:
    die(`모르는 명령: ${cmd}`);
}
