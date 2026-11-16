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
//   dump     <파일> [표 번호|p.<문단>] [행]    모양까지 모두: 칸(크기 · 세로 정렬 · 안쪽 여백 · 테두리) · 문단(정렬 · 왼쪽/오른쪽 여백 ·
//                                            들여쓰기/내어쓰기 · 문단 위아래 간격 · 줄 간격 · 글머리표/번호 · 한글이 줄 나눈 정보) ·
//                                            글자 모양 구간(글꼴 · 크기 · 굵게 · 장평 · 자간). 글 안의 ⏎ 는 문단 안 줄 바꿈, ↹ 는 탭
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
  case "dump": {
    // DocInfo: 글꼴 · 글자 모양 · 문단 모양 · 글머리표 · 번호 · 테두리
    const { inflateRawSync } = await import("node:zlib");
    const { createRequire } = await import("node:module");
    const { CFB } = createRequire(import.meta.url)("xlsx");
    let di = Buffer.from(CFB.find(doc.cfb, "/DocInfo").content);
    if (doc.compressed) di = inflateRawSync(di);
    const dir = lib.parseRecords(di);
    const idm = dir.find((r) => r.tag === 17).data;
    const counts = Array.from({ length: idm.length / 4 }, (_, i) => idm.readInt32LE(i * 4));
    const faces = dir.filter((r) => r.tag === 19).map((r) => r.data.toString("utf16le", 3, 3 + r.data.readUInt16LE(1) * 2));
    const hangulFaces = faces.slice(0, counts[1]);
    const charShapes = dir.filter((r) => r.tag === 21).map((r) => {
      const d = r.data;
      const attr = d.readUInt32LE(46);
      return `${hangulFaces[d.readUInt16LE(0)]} ${d.readInt32LE(42) / 100}pt${attr & 2 ? " 굵게" : ""}${attr & 1 ? " 기울임" : ""}${d[14] !== 100 ? ` 장평${d[14]}` : ""}${d.readInt8(21) ? ` 자간${d.readInt8(21)}` : ""}`;
    });
    const bullets = dir.filter((r) => r.tag === 24).map((r) => (r.data.length >= 14 ? String.fromCharCode(r.data.readUInt16LE(12)) : "?"));
    const ALIGN = ["양쪽", "왼쪽", "오른쪽", "가운데", "배분", "나눔"];
    const LS = ["%", "고정", "여백만", "최소"];
    const HEAD = ["", "개요", "번호", "글머리표"];
    const paraShapes = dir.filter((r) => r.tag === 25).map((r) => {
      const d = r.data;
      const a = d.readUInt32LE(0);
      const late = d.length >= 54;
      const lsType = late ? d.readUInt32LE(46) & 0x1f : a & 3;
      const ls = late ? d.readInt32LE(50) : d.readInt32LE(24);
      const head = (a >> 23) & 3;
      const mm = (u) => `${Math.round((u / 7200) * 25.4 * 10) / 10}mm`;
      const parts = [`정렬 ${ALIGN[(a >> 2) & 7]}`];
      if (d.readInt32LE(4)) parts.push(`왼쪽 ${mm(d.readInt32LE(4))}`);
      if (d.readInt32LE(8)) parts.push(`오른쪽 ${mm(d.readInt32LE(8))}`);
      const ind = d.readInt32LE(12);
      if (ind) parts.push(ind > 0 ? `들여쓰기 ${mm(ind)}` : `내어쓰기 ${mm(-ind)}`);
      if (d.readInt32LE(16)) parts.push(`위 ${mm(d.readInt32LE(16))}`);
      if (d.readInt32LE(20)) parts.push(`아래 ${mm(d.readInt32LE(20))}`);
      parts.push(`줄간격 ${ls}${LS[lsType] ?? "?"}`);
      if (head) parts.push(`${HEAD[head]}${head === 3 ? ` '${bullets[d.readUInt16LE(30) - 1] ?? "?"}'` : ` #${d.readUInt16LE(30)}`}`);
      parts.push((a >> 7) & 1 ? "한글 글자 단위 줄나눔" : "한글 어절 단위 줄나눔");
      return parts.join(" · ");
    });
    const borderFills = dir.filter((r) => r.tag === 20).map((r) => [0, 1, 2, 3].map((k) => `${r.data[2 + k * 6]}/${r.data[3 + k * 6]}`).join(" "));
    /** 문단 글 그대로 (⏎ 문단 안 줄 바꿈, ↹ 탭, ⟦개체⟧) */
    const rawText = (p) => {
      const t = doc.recs.slice(p + 1, subtreeEnd(doc.recs, p)).find((r) => r.tag === TAG.PARA_TEXT && r.level === doc.recs[p].level + 1);
      if (!t) return "";
      let s = "";
      for (let i = 0; i < t.data.length / 2; ) {
        const c = t.data.readUInt16LE(i * 2);
        if (c >= 32) (s += String.fromCharCode(c)), i++;
        else if (c === 10) (s += "⏎"), i++;
        else if (c === 13 || c === 0 || (c >= 24 && c <= 31)) i++;
        else (s += c === 9 ? "↹" : `⟦${c}⟧`), (i += 8);
      }
      return s;
    };
    const kid = (p, tag) => doc.recs.slice(p + 1, subtreeEnd(doc.recs, p)).find((r) => r.tag === tag && r.level === doc.recs[p].level + 1);
    const showPara = (p, pad) => {
      const ps = doc.recs[p].data.readUInt16LE(8);
      const cs = kid(p, TAG.PARA_CHAR_SHAPE);
      const runs = cs ? Array.from({ length: cs.data.length / 8 }, (_, i) => `${cs.data.readUInt32LE(i * 8)}:${charShapes[cs.data.readUInt32LE(i * 8 + 4)]}`) : [];
      const seg = kid(p, 69);
      console.log(`${pad}¶ ${JSON.stringify(rawText(p))}`);
      console.log(`${pad}   문단#${ps} ${paraShapes[ps]} | 글자 ${runs.join(" , ")}${seg ? ` | 한글 줄나눔 ${seg.data.length / 36}줄` : ""}`);
    };
    const showTable = (t, onlyRow) => {
      const range = tableParas()[t];
      if (!range) die(`표 ${t} 이 없어요`);
      console.log(`== 표 ${t}`);
      for (const c of tableCells(doc.recs, range[0], range[1])) {
        if (onlyRow !== undefined && c.row !== onlyRow) continue;
        const lh = doc.recs[c.list].data;
        const mm = (u) => Math.round((u / 7200) * 25.4 * 10) / 10;
        console.log(`c.${t}.${c.row}.${c.col} ${c.rowSpan}x${c.colSpan} ${mm(lh.readUInt32LE(16))}x${mm(lh.readUInt32LE(20))}mm 세로${["위", "가운데", "아래"][(lh.readUInt32LE(2) >> 21) & 3]} 안쪽여백 ${[24, 26, 28, 30].map((o) => mm(lh.readUInt16LE(o))).join("/")} 테두리 ${borderFills[lh.readUInt16LE(32) - 1] ?? "-"}`);
        for (const p of c.paras) showPara(p, "   ");
      }
    };
    const target = args[0];
    if (!target || target === "all") tableParas().forEach((_, t) => showTable(t));
    else if (target.startsWith("p.")) showPara(tops()[Number(target.slice(2))][0], "");
    else showTable(Number(target), args[1] !== undefined ? Number(args[1]) : undefined);
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
