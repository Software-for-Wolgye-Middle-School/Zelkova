import { newSectionId, parseList, sk, studentKey, type IepFields } from "@/lib/iep";

/**
 * 개별화교육계획 (학교 한글 파일 형식 그대로) — 화면과 서버가 같이 쓰는 칸 이름 · 기본값.
 *
 * 문서 칸
 *   year · semester · form("iep-v2") · setup("1": 처음 설정을 마침)
 *   term.start · term.end (YYYY-MM-DD) · team.principal · team.vice · team.sp1 · team.sp2 (개별화교육지원팀 기본값)
 *   studentList (학생 id 목록)
 * 학생 칸 (st.<학생 id>.*)
 *   name · grade · classNo · number · subjects · nameLine(인적 사항 첫 줄) · unit · birth · author · period
 *   address · phone · disability · selectedYear · health · medical · behavior · parentNeeds · career
 *   team.principal · team.vice · team.sp1 · team.sp2 · team.inc · team.parent
 *   plan.* · act.* · svc.* (교육활동계획 · 재량활동 · 관련서비스)
 *   sectionList (교과 · 일상생활 영역 id 목록)
 * 영역 칸 (s.<영역 id>.*)
 *   kind(subject|life) · subject · title · term · present · long · method · evalPlan
 *   goalList (단기목표 id 목록) · g.<목표 id>.t (성취기준) · g.<목표 id>.sc (성취평가 1~4)
 *   m0~m3.area · .content · .eval (월별 학습 내용 및 평가)
 */

export const FORM_V2 = "iep-v2";
export const SUBJECTS_V2 = ["국어", "영어", "수학"] as const;

/** 2026-08-14 → "2026. 8. 14." */
export const fmtDate = (iso: string | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : "";
};

/** 교육의 시작 및 종료시기 글 (교과 표 · 표지) */
export const termText = (f: IepFields) => (f["term.start"] || f["term.end"] ? `${fmtDate(f["term.start"])} ～ ${fmtDate(f["term.end"])}` : "");
/** 교육활동계획의 실시기간 글 (원본처럼 두 줄) */
const planPeriod = (f: IepFields) => (f["term.start"] || f["term.end"] ? `${fmtDate(f["term.start"])} ~\n     ${fmtDate(f["term.end"])}` : "");

/** 교과별 교육방법 · 평가계획 기본값 (학교 원본 한글 파일과 같은 글) */
export const SUBJECT_DEFAULTS: Record<string, { method: string; evalPlan: string }> = {
  국어: {
    method: "교수·학습방법 : 직접 교수, 언어경험접근법, 표기처리중심교수법 등\n교수매체 : 초등 2학년 성취기준에 의거한 교재, 기본교육과정(중학교) 성취기준에 의거한 교사제작 교재, 통합교육과정",
    evalPlan: "관찰평가, 자기평가, 동료평가, 포트폴리오평가",
  },
  영어: {
    method: "교수·학습방법 : 직접 교수, 또래 교수, 역할극\n교수매체 : 초등 3~4년 교과서 편집 교재, 기본교육과정 교과서, 영어 회화 오디오북, 동영상 등",
    evalPlan: "수행 시 마다 관찰하여 평가, 포트폴리오 평가, 수행평가, 서술평가",
  },
  수학: {
    method: "교수·학습방법 : 직접교수\n교수매체 : 공통교육과정 수학교과서 및 교재",
    evalPlan: "관찰평가, 자기평가, 동료평가, 포트폴리오평가",
  },
};
export const LIFE_METHOD = "교수·학습방법 : 직접 교수, 지역사회 중심교수 등";

/** 인적 사항 첫 줄: "1학년 1반 5번  이름 : 홍길동" */
export const nameLine = (grade: string, cls: string, number: string, name: string) => `${grade}학년 ${cls}반 ${number}번  이름 : ${name}`;

export type StudentInput = {
  name: string;
  grade: string;
  cls: string;
  number: string;
  subjects: string[];
  address: string;
  phone: string;
  birth: string;
  disability: string;
  selectedYear: string;
  health: string;
  medical: string;
  behavior: string;
  parentNeeds: string;
  career: string;
  /** 학부모 · 통합교사 이름 (개별화교육지원팀) */
  parent?: string;
  inc?: string;
};

/** 학생 한 명을 더할 때 쓸 칸들: 적은 인적 사항 + 개별화교육지원팀 · 기간 · 교육활동계획 · 재량활동 · 관련서비스 기본값 + 과목마다의 계획 */
export function studentFieldsV2(f: IepFields, sid: string, s: StudentInput): IepFields {
  const k = (name: string) => studentKey(sid, name);
  const sp1 = (f["team.sp1"] ?? "").trim();
  const sp2 = (f["team.sp2"] ?? "").trim();
  const both = [sp1, sp2].filter(Boolean);
  const subjects = SUBJECTS_V2.filter((x) => s.subjects.includes(x));
  const subjectText = subjects.join(", ");
  const out: IepFields = {
    [k("name")]: s.name,
    [k("grade")]: s.grade,
    [k("classNo")]: s.cls,
    [k("number")]: s.number,
    [k("subjects")]: subjects.join(","),
    [k("unit")]: s.grade && s.cls ? `${s.grade}학년 ${s.cls}반` : "",
    [k("nameLine")]: nameLine(s.grade, s.cls, s.number, s.name),
    [k("birth")]: s.birth,
    [k("author")]: both.join(", "),
    [k("period")]: termText(f),
    [k("address")]: s.address,
    [k("phone")]: s.phone,
    [k("disability")]: s.disability,
    [k("selectedYear")]: s.selectedYear,
    [k("health")]: s.health,
    [k("medical")]: s.medical,
    [k("behavior")]: s.behavior,
    [k("parentNeeds")]: s.parentNeeds,
    [k("career")]: s.career,
    // 개별화교육지원팀 (처음 설정한 이름이 기본값)
    [k("team.principal")]: f["team.principal"] ?? "",
    [k("team.vice")]: f["team.vice"] ?? "",
    [k("team.sp1")]: sp1,
    [k("team.sp2")]: sp2,
    [k("team.inc")]: (s.inc ?? "").trim(),
    [k("team.parent")]: (s.parent ?? "").trim(),
    // 교육활동계획
    [k("plan.placement")]: "시간제\n특수학급\n(부분 통합교육)",
    [k("plan.inc.period")]: planPeriod(f),
    [k("plan.inc.subject")]: subjectText ? `${subjectText} 외 교과\n및 창체` : "교과 및 창체",
    [k("plan.inc.teacher")]: "담임 및 해당 교과교사",
    [k("plan.sp.period")]: planPeriod(f),
    [k("plan.sp.subject")]: subjectText ? `${subjectText}\n동아리, 외부활동` : "동아리, 외부활동",
    [k("plan.sp.teacher")]: "특수교사",
    // 재량(외부)활동 및 방과후 학교
    [k("act.after.who")]: both.length ? `${both.join(", ")}\n(특수교사)` : "",
    [k("act.after.period")]: "매주 수요일",
    [k("act.after.note")]: "다양한 소근육활동\n및 일상생활 활동",
    [k("act.field.who")]: both.map((n) => `${n}(특수교사)`).join("\n"),
    [k("act.field.period")]: "4회 예정",
    [k("act.field.note")]: "직업 및 이색체험 예정",
    [k("act.sex.who")]: sp1 ? `${sp1}(특수교사)` : "",
    [k("act.sex.period")]: "학기별 2회",
    [k("act.sex.note")]: "성교육 및 성폭력 예방교육",
    [k("act.sex.note2")]: "인권의 개념 이해 및 인권감수성 향상",
    [k("act.safety.who")]: (sp2 || sp1) ? `${sp2 || sp1}(특수교사)` : "",
    [k("act.safety.period")]: "현장체험학습 관련 안전교육 실시",
    [k("act.safety.note")]: "안전한 일상생활 습관 형성",
    // 특수교육 관련서비스 및 평가조정
    [k("svc.therapyArea")]: "언어치료",
    [k("svc.therapyMethod")]: "굳센카드",
    [k("svc.transport")]: "해당없음",
    [k("svc.staff")]: "필요",
    [k("svc.adjust")]: "평가환경: 느티나무반",
  };
  // 수강 과목마다의 계획 + 일상생활적응 영역 (현재 수준 · 목표 · 월별 계획은 비움, 교육방법 · 평가계획은 기본값)
  const list: string[] = [];
  const addSection = (kind: "subject" | "life", subject = "") => {
    const id = newSectionId();
    list.push(id);
    const goal = newSectionId();
    Object.assign(out, {
      [sk(id, "kind")]: kind,
      [sk(id, "subject")]: subject,
      [sk(id, "title")]: kind === "subject" ? `${subject} - ${s.name}` : "",
      [sk(id, "term")]: termText(f),
      [sk(id, "method")]: kind === "subject" ? SUBJECT_DEFAULTS[subject]?.method ?? "교수·학습방법 : \n교수매체 : " : LIFE_METHOD,
      [sk(id, "evalPlan")]: kind === "subject" ? (SUBJECT_DEFAULTS[subject]?.evalPlan ?? "") : "",
      [sk(id, "goalList")]: JSON.stringify([goal]),
    });
  };
  for (const subject of subjects) addSection("subject", subject);
  addSection("life");
  out[k("sectionList")] = JSON.stringify(list);
  return out;
}

/** 영역의 단기목표 id 들 (적어도 한 줄) */
export const goalIdsOf = (f: IepFields, sec: string) => parseList(f[sk(sec, "goalList")]);

/** 문서의 구조 (학생 · 영역 · 단기목표 줄) — 바뀌면 화면의 양식 모양을 다시 받음 */
export function structureKey(f: IepFields) {
  const ids = parseList(f.studentList);
  return JSON.stringify([
    f.year,
    f.semester,
    ids.map((sid) => [sid, parseList(f[studentKey(sid, "sectionList")]).map((sec) => [sec, f[sk(sec, "kind")], f[sk(sec, "goalList")]])]),
  ]);
}
