import {
  cloneRange,
  deleteTableRow,
  insertTableRows,
  openHwp,
  paraCharShapes,
  readParaText,
  saveHwp,
  setCellText,
  setParaRuns,
  setParaText,
  subtreeEnd,
  tableCells,
  TAG,
  topParagraphs,
  verifyRecords,
  type HwpDoc,
  type Rec,
  type Run,
} from "@/lib/hwpEdit";
import { readFormDoc, type FormBlock, type FormCell } from "@/lib/hwpForm";
import { monthsFor, parseList, sk, studentKey, withTerm, type IepFields } from "@/lib/iep";
import { goalIdsOf, termText } from "@/lib/iepV2";

/**
 * 개별화교육계획을 학교 한글 파일 형식 그대로 조립함 (서버 전용).
 * 학교 빈 양식(public/templates/iep-form.hwp)의 문단 묶음을 학생마다 · 영역마다 복사하고, 단기목표 줄 수를 맞춘 뒤 칸에 글을 넣음.
 * 같은 조립 결과로 ① 한글 파일을 만들고 ② 편집 화면의 모양(어느 칸이 어느 저장 칸인지)을 만듦 → 화면과 파일이 늘 같음.
 */

/** 빈 양식의 맨 위 문단 번호 (학생 1 의 표지 · 인적 사항 · 월별 · 일상생활 표, 학생 2 의 영어 표가 가장 반듯해 교과 표로 씀) */
const P = { FIRST: 0, COVER_LINE: 19, COVER_HEAD: [1, 4], COVER_TABLE: 5, COVER_TAIL: [6, 8], PROFILE_TITLE: 9, PROFILE: 10, PLAN: 11, ACT: 12, SVC: 13, SUBJECT: 36, GAP_SUBJECT: 15, MONTH: 16, LIFE: 17, GAP: 18 } as const;
/** 교과 · 일상생활 표에서 단기목표 줄 (5~16행, 12줄) */
const GOAL_FIRST = 5;
const GOAL_ROWS = 12;

/** 칸이 어느 저장 칸과 이어지는지 */
export type Bind =
  | { field: string; para?: number } // 칸 전체(또는 para 번째 문단)가 한 저장 칸
  | { parts: { label: string; field: string }[] } // 문단마다 "이름표 : 값" (인적 사항 목록 · 특수교사 두 줄)
  | { choice: { field: string; value: string } }; // 성취평가 1~4 (누르면 ○)
export type LayoutCell = FormCell & { bind?: Bind; goal?: { sec: string; gid: string } };
export type LayoutBlock = Exclude<FormBlock, { type: "table" }> | (Extract<FormBlock, { type: "table" }> & { cells: LayoutCell[]; goalSec?: string });
export type Layout = { sections: { sid: string | null; label: string; blocks: LayoutBlock[] }[] };

/** page: 한글 파일에서 이 묶음이 새 쪽에서 시작함 (화면도 쪽을 나눠 그림) */
type Piece = { recs: Rec[]; binds?: Map<string, Bind>; goals?: Map<string, { sec: string; gid: string }>; goalSec?: string; page?: boolean };

/** 빈 양식이 예상한 모양인지 확인 (다른 양식으로 바뀌면 칸 위치가 어긋나므로) */
function checkTemplate(doc: HwpDoc) {
  const tops = topParagraphs(doc.recs);
  const firstCell = (p: number) => {
    const [s, e] = tops[p];
    const c = tableCells(doc.recs, s, e)[0];
    return c ? c.paras.map((x) => paraText(doc.recs, x)).join("").replace(/\s/g, "") : "";
  };
  const expect: [number, string][] = [
    [P.COVER_TABLE, "반"],
    [P.PROFILE, "인적사항"],
    [P.PLAN, "교육활동계획"],
    [P.ACT, "재량(외부)활동및방과후학교"],
    [P.SVC, "특수교육관련서비스및평가조정"],
    [P.MONTH, "학기월별학습내용및평가"],
  ];
  for (const [p, want] of expect) if (!firstCell(p).includes(want)) throw new Error(`빈 양식의 ${p}번째 문단이 예상한 표(${want})가 아니에요`);
  if (!firstCell(P.SUBJECT).startsWith("영어")) throw new Error("빈 양식의 교과 표 위치가 달라요");
  if (!firstCell(P.LIFE).startsWith("일상생활적응")) throw new Error("빈 양식의 일상생활적응 표 위치가 달라요");
}

function paraText(recs: Rec[], p: number) {
  const t = recs.slice(p + 1, subtreeEnd(recs, p)).find((r) => r.tag === TAG.PARA_TEXT && r.level === recs[p].level + 1);
  return t ? readParaText(t.data) : "";
}

/** 양식 묶음 하나 (그 안의 표 칸에 글을 넣고, 칸과 저장 칸을 이음) */
class Block implements Piece {
  recs: Rec[];
  binds = new Map<string, Bind>();
  goals = new Map<string, { sec: string; gid: string }>();
  goalSec?: string;
  page?: boolean;
  constructor(recs: Rec[]) {
    this.recs = recs;
  }
  private cell(r: number, c: number) {
    return tableCells(this.recs, 0, this.recs.length).find((x) => x.row === r && x.col === c);
  }
  /** 칸에 글 (한 줄씩 칸의 문단에) 하고 저장 칸과 이음 */
  set(r: number, c: number, text: string, field?: string) {
    const cell = this.cell(r, c);
    if (!cell) return;
    setCellText(this.recs, cell, text);
    if (field) this.binds.set(`${r}.${c}`, { field });
  }
  /** 칸의 para 번째 문단에만 글 */
  setPara(r: number, c: number, para: number, text: string, field?: string) {
    const cell = this.cell(r, c);
    if (!cell?.paras[para]) return;
    setParaText(this.recs, cell.paras[para], text);
    if (field) this.binds.set(`${r}.${c}`, { field, para });
  }
  /** 문단마다 "이름표 : 값" — 양식의 이름표와 글자 모양은 그대로 두고 뒤에 값을 붙임 */
  labeled(r: number, c: number, items: { field: string; value: string }[]) {
    const cell = this.cell(r, c);
    if (!cell) return;
    const parts: { label: string; field: string }[] = [];
    // 뒤 문단부터 바꿔야 앞 문단 위치가 그대로
    for (let i = Math.min(items.length, cell.paras.length) - 1; i >= 0; i--) {
      const p = cell.paras[i];
      const raw = paraText(this.recs, p);
      const label = raw.trimEnd().endsWith(":") ? `${raw.trimEnd()} ` : raw;
      const shapes = paraCharShapes(this.recs, p);
      const runs: Run[] = [];
      shapes.forEach(([at, id], k) => {
        const next = shapes[k + 1]?.[0] ?? Infinity;
        if (at < label.length) runs.push({ text: label.slice(at, Math.min(next, label.length)), shape: id });
      });
      // 값의 글자 모양: 이름표 뒤에서 시작하는 모양이 있으면 그것, 없으면 이름표 끝의 모양 (원본과 같음)
      const valueShape = (shapes.find(([at]) => at >= label.length) ?? shapes.filter(([at]) => at < label.length).pop())?.[1];
      runs.push({ text: items[i].value, shape: valueShape });
      setParaRuns(this.recs, p, runs);
      parts.unshift({ label: label.trimEnd(), field: items[i].field });
    }
    this.binds.set(`${r}.${c}`, { parts });
  }
  /** "1학년 1반 5번  이름 : 홍길동" — 원본처럼 번호는 다른 글자 모양으로 */
  nameLine(r: number, c: number, text: string, field: string) {
    const cell = this.cell(r, c);
    if (!cell?.paras[0]) return;
    const m = /^(.*?반\s*)(\S*번)(\s*)(\s*이름.*)$/.exec(text);
    const shapes = paraCharShapes(this.recs, cell.paras[0]).map(([, id]) => id);
    if (m && shapes.length >= 4) setParaRuns(this.recs, cell.paras[0], [{ text: m[1], shape: shapes[0] }, { text: m[2], shape: shapes[1] }, { text: m[3] || " ", shape: shapes[2] }, { text: m[4], shape: shapes[3] }]);
    else setParaText(this.recs, cell.paras[0], text);
    this.binds.set(`${r}.${c}`, { field });
  }
  /** 양식 글이 re 와 맞는 칸의 글을 바꿈 (예: "현 재 / 수행수준" → "현재학습 / 수행수준") */
  relabel(r: number, c: number, re: RegExp, text: string) {
    const cell = this.cell(r, c);
    if (cell && re.test(cell.paras.map((p) => paraText(this.recs, p)).join("\n"))) setCellText(this.recs, cell, text);
  }
  /** 글 속 "2026학년도 2학기" 를 이 문서의 학년도 · 학기로 (맨 위 문단) */
  term(year: string, semester: string) {
    topParagraphs(this.recs).forEach(([p]) => {
      const t = paraText(this.recs, p);
      const next = withTerm(t, year, semester);
      if (next !== t) setParaText(this.recs, p, next);
    });
  }
  /** 단기목표 줄 수를 n 으로 맞춤 (양식의 12줄에서 더하거나 뺌) */
  goalRows(n: number) {
    const rows = Math.max(1, n);
    if (rows > GOAL_ROWS) insertTableRows(this.recs, 0, this.recs.length, GOAL_FIRST + GOAL_ROWS - 1, rows - GOAL_ROWS);
    for (let r = GOAL_FIRST + GOAL_ROWS - 1; r >= GOAL_FIRST + rows; r--) deleteTableRow(this.recs, 0, this.recs.length, r);
    return rows - GOAL_ROWS; // 아래 줄들이 밀린 만큼
  }
}

let cached: { file: Uint8Array; doc: HwpDoc } | null = null;
/** 빈 양식을 한 번만 읽어 둠 (조립할 때마다 복사본을 씀) */
function blank(file: Uint8Array) {
  if (!cached || cached.file !== file) {
    const doc = openHwp(file);
    checkTemplate(doc);
    cached = { file, doc };
  }
  return cached.doc;
}

/** 문서 칸으로 개별화교육계획을 조립 → 한글 문서와 조각들 */
function assemble(f: IepFields, file: Uint8Array): { doc: HwpDoc; pieces: Piece[] } {
  const src = blank(file);
  const tops = topParagraphs(src.recs);
  const take = (from: number, to = from) => new Block(cloneRange(src.recs, tops[from][0], tops[to][1]));
  const year = (f.year ?? "").trim();
  const semester = (f.semester ?? "").trim();
  const v = (key: string) => f[key] ?? "";
  const pieces: Piece[] = [];
  const add = (b: Block, page = false) => {
    b.page = page;
    pieces.push(b);
  };

  const students = parseList(f.studentList);
  if (!students.length) {
    // 학생이 없으면 표지 첫 쪽만 (개별화교육지원팀은 처음 설정한 이름)
    const line = take(P.FIRST);
    line.term(year, semester);
    add(line, true);
    add(take(P.COVER_HEAD[0], P.COVER_HEAD[1]));
    const cover = take(P.COVER_TABLE);
    cover.set(1, 9, termText(f));
    (["team.principal", "team.vice", "team.sp1", "team.sp2"] as const).forEach((key, i) => cover.set(4 + i, 4, v(key), key));
    add(cover);
    add(take(P.COVER_TAIL[0], P.COVER_TAIL[1]));
  }

  students.forEach((sid, i) => {
    const k = (name: string) => studentKey(sid, name);
    const sv = (name: string) => v(k(name));
    // 표지
    const line = take(i === 0 ? P.FIRST : P.COVER_LINE);
    line.term(year, semester);
    add(line, true);
    add(take(P.COVER_HEAD[0], P.COVER_HEAD[1]));
    const cover = take(P.COVER_TABLE);
    cover.set(0, 1, sv("unit"), k("unit"));
    cover.set(0, 5, sv("name"), k("name"));
    cover.set(0, 10, sv("birth"), k("birth"));
    cover.set(1, 2, sv("author"), k("author"));
    cover.set(1, 9, sv("period"), k("period"));
    ["team.principal", "team.vice", "team.sp1", "team.sp2", "team.inc", "team.parent"].forEach((t, r) => cover.set(4 + r, 4, sv(t), k(t)));
    add(cover);
    add(take(P.COVER_TAIL[0], P.COVER_TAIL[1]));

    // 인적 사항 · 개별화교육지원팀
    const title = take(P.PROFILE_TITLE);
    title.term(year, semester);
    add(title, true);
    const profile = take(P.PROFILE);
    profile.nameLine(0, 1, sv("nameLine"), k("nameLine"));
    profile.labeled(
      1,
      0,
      ["address", "phone", "birth", "disability", "selectedYear", "health", "medical", "behavior", "parentNeeds", "career"].map((name) => ({ field: k(name), value: sv(name) })),
    );
    profile.set(1, 3, sv("team.principal"), k("team.principal"));
    profile.set(2, 3, sv("team.vice"), k("team.vice"));
    profile.set(3, 3, sv("team.inc"), k("team.inc"));
    // 특수교사 칸은 두 문단: 한 분씩
    profile.labeled(4, 3, [
      { field: k("team.sp1"), value: sv("team.sp1") },
      { field: k("team.sp2"), value: sv("team.sp2") },
    ]);
    profile.set(5, 3, sv("team.parent"), k("team.parent"));
    add(profile);

    const plan = take(P.PLAN);
    plan.set(2, 0, sv("plan.placement"), k("plan.placement"));
    (["inc", "sp"] as const).forEach((g, r) => {
      plan.set(2 + r, 2, sv(`plan.${g}.period`), k(`plan.${g}.period`));
      plan.set(2 + r, 3, sv(`plan.${g}.subject`), k(`plan.${g}.subject`));
      plan.set(2 + r, 4, sv(`plan.${g}.teacher`), k(`plan.${g}.teacher`));
    });
    add(plan);

    const act = take(P.ACT);
    (["after", "field"] as const).forEach((g, r) => {
      act.set(2 + r, 2, sv(`act.${g}.who`), k(`act.${g}.who`));
      act.set(2 + r, 3, sv(`act.${g}.period`), k(`act.${g}.period`));
      act.set(2 + r, 4, sv(`act.${g}.note`), k(`act.${g}.note`));
    });
    act.set(4, 2, sv("act.sex.who"), k("act.sex.who"));
    act.set(4, 3, sv("act.sex.period"), k("act.sex.period"));
    act.set(4, 4, sv("act.sex.note"), k("act.sex.note"));
    act.set(5, 4, sv("act.sex.note2"), k("act.sex.note2"));
    act.set(6, 2, sv("act.safety.who"), k("act.safety.who"));
    act.set(6, 3, sv("act.safety.period"), k("act.safety.period"));
    act.set(6, 4, sv("act.safety.note"), k("act.safety.note"));
    add(act);

    const svc = take(P.SVC);
    ["svc.therapyArea", "svc.therapyMethod", "svc.transport", "svc.staff", "svc.adjust"].forEach((name, c) => svc.set(2, c, sv(name), k(name)));
    add(svc);

    // 수강 과목마다의 계획과 일상생활적응 영역
    for (const sec of parseList(sv("sectionList"))) {
      const s = (name: string) => v(sk(sec, name));
      const life = s("kind") === "life";
      const t = take(life ? P.LIFE : P.SUBJECT);
      const goals = goalIdsOf(f, sec);
      const shift = t.goalRows(goals.length);
      t.goalSec = sec;
      t.relabel(1, 0, /^\s*현\s*재/, "현재학습\n수행수준");
      if (!life) t.set(0, 0, s("title"), sk(sec, "title"));
      t.setPara(0, 2, 1, s("term"), sk(sec, "term"));
      t.set(1, 1, s("present"), sk(sec, "present"));
      t.set(2, 1, s("long"), sk(sec, "long"));
      goals.forEach((gid, gi) => {
        const r = GOAL_FIRST + gi;
        const base = sk(sec, `g.${gid}`);
        t.set(r, 1, v(`${base}.t`), `${base}.t`);
        t.goals.set(`${r}.1`, { sec, gid });
        for (let n = 1; n <= 4; n++) {
          t.set(r, 2 + n, v(`${base}.sc`) === String(n) ? "○" : "");
          t.binds.set(`${r}.${2 + n}`, { choice: { field: `${base}.sc`, value: String(n) } });
        }
      });
      t.set(18 + shift, 1, s("method"), sk(sec, "method"));
      if (!life) t.set(19 + shift, 1, s("evalPlan"), sk(sec, "evalPlan"));
      add(t, true);
      if (!life) {
        add(take(P.GAP_SUBJECT));
        const m = take(P.MONTH);
        m.set(0, 0, `${semester || "2"}학기 월별 학습 내용 및 평가`);
        monthsFor(semester).forEach((label, j) => {
          m.set(2 + j, 0, label);
          m.set(2 + j, 1, s(`m${j}.area`), sk(sec, `m${j}.area`));
          m.set(2 + j, 2, s(`m${j}.content`), sk(sec, `m${j}.content`));
          m.set(2 + j, 3, s(`m${j}.eval`), sk(sec, `m${j}.eval`));
        });
        add(m, true);
      } else add(take(P.GAP));
    }
  });

  const doc: HwpDoc = { ...src, recs: pieces.flatMap((p) => p.recs) };
  return { doc, pieces };
}

/** 개별화교육계획 한글 파일. 한글이 열 수 없는 구조가 되면 만들지 않고 오류 */
export function buildIepV2Hwp(f: IepFields, file: Uint8Array, title: string): Buffer {
  const { doc } = assemble(f, file);
  const problems = verifyRecords(doc.recs);
  if (problems.length) throw new Error(`한글 파일 구조 문제: ${problems.slice(0, 3).join(" / ")}`);
  return saveHwp(doc, title);
}

/** 편집 화면의 모양: 조립한 한글 문서를 그대로 그리되, 칸마다 이어진 저장 칸을 붙임 (학생마다 나눔) */
export function layoutIepV2(f: IepFields, file: Uint8Array): Layout {
  const { doc, pieces } = assemble(f, file);
  const form = readFormDoc(doc);
  // 표 번호(문서 순서) → 그 표를 만든 조각
  const tablePieces = pieces.filter((p) => p.recs.some((r) => r.tag === TAG.TABLE));
  // 새 쪽이 시작되는 맨 위 문단 번호
  const pageStarts = new Set<number>();
  let at = 0;
  for (const p of pieces) {
    if (p.page) pageStarts.add(at);
    at += topParagraphs(p.recs).length;
  }
  for (const sec of form.sections) for (const b of sec.blocks) b.page = pageStarts.has(b.pi);
  const students = parseList(f.studentList);
  return {
    sections: form.sections.map((sec, i) => {
      const sid = students[i] ?? null;
      const name = sid ? (f[studentKey(sid, "name")] ?? "").trim() : "";
      return {
        sid,
        label: sid ? name || `학생 ${i + 1}` : "표지",
        blocks: sec.blocks.map((b): LayoutBlock => {
          if (b.type !== "table") return b;
          const no = Number(b.key.split(".")[1]);
          const piece = tablePieces[no];
          return {
            ...b,
            goalSec: piece?.goalSec,
            cells: b.cells.map((c) => {
              const at = `${c.r}.${c.c}`;
              return { ...c, bind: piece?.binds?.get(at), goal: piece?.goals?.get(at) };
            }),
          };
        }),
      };
    }),
  };
}
