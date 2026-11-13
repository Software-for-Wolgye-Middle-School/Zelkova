import { cloneRange, openHwp, replaceSameLength, saveHwp, setParaText, tableCells, topParagraphs, type Rec } from "@/lib/hwpEdit";
import { DEFAULT_ROWS, MAX_ROWS, MONTH_ROWS, monthsFor, parseList, sk, studentIds, studentKey, type IepFields } from "@/lib/iep";

/**
 * 개별화교육계획을 학교 양식 그대로 한글(HWP) 파일로 만듦 (서버 전용).
 * 빈 양식(scripts/make-iep-template.mjs 로 학교 원본에서 학생 정보를 지우고 만든 것)의 문단 묶음을
 * 학생마다 · 교과마다 복사하고 칸에 글을 넣음.
 *
 * 빈 양식의 맨 위 문단 순서:
 *   0 첫 표지 줄(구역 정의 포함) · 1 표지 줄(둘째 학생부터) · 2~9 표지 · 10~14 인적 사항 · 교육활동 · 관련서비스
 *   15 교과 표 · 16 월별 학습 표 · 17 일상생활적응 표 · 18 빈 줄
 */

const B = { FIRST: 0, COVER_LINE: 1, COVER: [2, 9], COVER_TABLE: 6, PROFILE: [10, 14], SUBJECT: 15, MONTH: 16, LIFE: 17, GAP: 18 } as const;
/** 교과 · 일상생활 표에서 단기목표를 쓰는 줄 (5~16행, 12줄) */
const GOAL_FIRST = 5;
const GOAL_LAST = 16;

/** 양식 문단 묶음 하나 (그 안에 표가 있으면 칸을 채울 수 있음) */
class Block {
  recs: Rec[];
  constructor(recs: Rec[]) {
    this.recs = recs;
  }
  /** 표의 [row, col] 칸의 para 번째 문단에 글을 넣음 */
  cell(row: number, col: number, text: string, para = 0) {
    const cell = tableCells(this.recs, 0, this.recs.length).find((c) => c.row === row && c.col === col);
    if (!cell || !cell.paras[para]) return;
    setParaText(this.recs, cell.paras[para], text);
  }
  /** 글 안의 "2026학년도 2학기" 를 바꿈 (같은 길이일 때만) */
  term(year: string, semester: string) {
    if (!/^\d{4}$/.test(year) || !/^\d$/.test(semester)) return;
    topParagraphs(this.recs).forEach(([p]) => replaceSameLength(this.recs, p, /\d{4}학년도 \d학기/, () => `${year}학년도 ${semester}학기`));
  }
}

/** template: 빈 양식 파일(public/templates/iep-template.hwp) */
export function buildIepHwp(f: IepFields, template: Uint8Array): Buffer {
  const doc = openHwp(template);
  const tops = topParagraphs(doc.recs);
  const take = (from: number, to = from) => new Block(cloneRange(doc.recs, tops[from][0], tops[to][1]));
  const year = (f.year ?? "").trim();
  const semester = (f.semester ?? "").trim();
  const months = monthsFor(semester);

  const out: Rec[] = [];
  const ids: (string | null)[] = studentIds(f);
  (ids.length ? ids : [null]).forEach((sid, i) => {
    const v = (k: string) => (sid === null ? "" : (f[studentKey(sid, k)] ?? "").trim());
    const name = v("name");

    // 표지
    const line = take(i === 0 ? B.FIRST : B.COVER_LINE);
    line.term(year, semester);
    out.push(...line.recs);
    // 표지: 표 앞(그림 · 제목) · 표 · 표 뒤(학교 이름)
    const coverTable = take(B.COVER_TABLE);
    coverTable.cell(0, 1, v("unit"));
    coverTable.cell(0, 5, name);
    coverTable.cell(0, 10, v("birth"));
    coverTable.cell(1, 2, v("author"));
    coverTable.cell(1, 9, v("period"));
    ["team.principal", "team.vice", "team.sp1", "team.sp2", "team.inc", "team.parent"].forEach((k, r) => coverTable.cell(4 + r, 4, v(k)));
    out.push(...take(B.COVER[0], B.COVER_TABLE - 1).recs, ...coverTable.recs, ...take(B.COVER_TABLE + 1, B.COVER[1]).recs);

    // 인적 사항 · 교육활동계획 · 재량활동 · 관련서비스
    const title = take(B.PROFILE[0]);
    title.term(year, semester);
    out.push(...title.recs);
    const profile = take(B.PROFILE[0] + 1);
    profile.cell(0, 1, `${v("grade")}학년 ${v("classNo")}반 ${v("number")}번  이름 : ${name}`);
    profile.cell(
      1,
      0,
      [
        ["1. 주소", "address"],
        ["2. 전화번호", "phone"],
        ["3. 생년월일", "birth"],
        ["4. 장애유형 및 등급", "disability"],
        ["5. 특수교육대상 선정년도", "selectedYear"],
        ["6. 건강상태", "health"],
        ["7. 병력 및 약물복용", "medical"],
        ["8. 행동특성", "behavior"],
        ["9. 학부모 요구", "parentNeeds"],
        ["10. 졸업 후 진로", "career"],
      ]
        .map(([label, k]) => `${label} : ${v(k)}`)
        .join("\n"),
    );
    profile.cell(1, 3, v("team.principal"));
    profile.cell(2, 3, v("team.vice"));
    profile.cell(3, 3, v("team.inc"));
    profile.cell(4, 3, [v("team.sp1"), v("team.sp2")].filter(Boolean).join("\n"));
    profile.cell(5, 3, v("team.parent"));
    out.push(...profile.recs);

    const plan = take(B.PROFILE[0] + 2);
    plan.cell(2, 0, v("plan.placement"));
    (["inc", "sp"] as const).forEach((g, r) => {
      plan.cell(2 + r, 2, v(`plan.${g}.period`));
      plan.cell(2 + r, 3, v(`plan.${g}.subject`));
      plan.cell(2 + r, 4, v(`plan.${g}.teacher`));
    });
    out.push(...plan.recs);

    const act = take(B.PROFILE[0] + 3);
    (["after", "field"] as const).forEach((g, r) => {
      act.cell(2 + r, 2, v(`act.${g}.who`));
      act.cell(2 + r, 3, v(`act.${g}.period`));
      act.cell(2 + r, 4, v(`act.${g}.note`));
    });
    act.cell(4, 2, v("act.sex.who"));
    act.cell(4, 3, v("act.sex.period"));
    act.cell(4, 4, v("act.sex.note"));
    act.cell(5, 4, v("act.sex.note2"));
    act.cell(6, 2, v("act.safety.who"));
    act.cell(6, 3, v("act.safety.period"));
    act.cell(6, 4, v("act.safety.note"));
    out.push(...act.recs);

    const svc = take(B.PROFILE[1]);
    ["svc.therapyArea", "svc.therapyMethod", "svc.transport", "svc.staff", "svc.adjust"].forEach((k, c) => svc.cell(2, c, v(k)));
    out.push(...svc.recs);

    // 교과 · 일상생활 영역 (화면에서 정한 순서대로)
    const sections = sid === null ? [] : parseList(f[studentKey(sid, "sectionList")]);
    for (const sec of sections) {
      const s = (k: string) => (f[sk(sec, k)] ?? "").trim();
      const life = s("kind") === "life";
      const t = take(life ? B.LIFE : B.SUBJECT);
      if (!life) {
        const subject = s("subject") || "교과";
        t.cell(0, 0, `${subject}${s("title") ? ` · ${s("title")}` : ""} - ${name}`);
      }
      t.cell(0, 2, s("term"), 1);
      t.cell(1, 1, s("present"));
      t.cell(2, 1, s("long"));
      // 단기목표: 양식의 12줄에 차례로, 넘치는 목표는 마지막 줄에 이어 씀
      const rows = Math.min(MAX_ROWS, Math.max(1, Number(s("rows")) || DEFAULT_ROWS));
      const goals = Array.from({ length: rows }, (_, r) => ({ text: s(`r${r}.t`), score: s(`r${r}.sc`) })).filter((g) => g.text || g.score);
      const slots = GOAL_LAST - GOAL_FIRST + 1;
      goals.slice(0, slots).forEach((g, r) => {
        const extra = r === slots - 1 ? goals.slice(slots) : [];
        t.cell(GOAL_FIRST + r, 1, [g.text, ...extra.map((x) => x.text + (x.score ? ` (${x.score})` : ""))].join("\n"));
        if (/^[1-4]$/.test(g.score)) t.cell(GOAL_FIRST + r, 2 + Number(g.score), "○");
      });
      t.cell(18, 1, life ? `교수·학습방법 : ${s("method")}` : `교수·학습방법 : ${s("method")}\n교수매체 : ${s("media")}`);
      if (!life) t.cell(19, 1, s("evalPlan"));
      out.push(...t.recs);

      if (!life) {
        const m = take(B.MONTH);
        m.cell(0, 0, `${semester || "2"}학기 월별 학습 내용 및 평가`);
        for (let j = 0; j < MONTH_ROWS; j++) {
          m.cell(2 + j, 0, months[j]);
          m.cell(2 + j, 1, s(`m${j}.area`));
          m.cell(2 + j, 2, s(`m${j}.content`));
          m.cell(2 + j, 3, s(`m${j}.eval`));
        }
        out.push(...m.recs);
      }
      out.push(...take(B.GAP).recs);
    }
  });

  doc.recs = out;
  return saveHwp(doc, `${year}학년도 ${semester}학기 개별화교육계획`);
}
