/**
 * 개별화교육계획(IEP) 문서 모양과 동시 편집 병합 규칙 (브라우저와 서버가 같이 씀).
 *
 * 문서 하나는 "칸 이름 → 글자" 의 평평한 목록. 두 선생님이 동시에 고쳐도 서로 다른 칸은 그대로 합쳐지고,
 * 같은 칸을 동시에 고치면 바뀐 부분이 겹치지 않는 한 글자 단위로 둘 다 살림 (merge3).
 * 교과 영역 목록(sectionList)처럼 목록인 칸은 더하고 지운 것을 각각 반영해 합침 (mergeList).
 */

export type IepFields = Record<string, string>;

/** 문서 목록에 보여 줄 요약 */
export type IepMeta = {
  id: string;
  year: string;
  semester: string;
  grade: string;
  cls: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** 마지막으로 고친 선생님 */
  updatedBy: string;
};

/** 지금 문서를 보고 있는 사람 */
export type IepPresence = {
  id: string;
  name: string;
  color: string;
  /** 입력 중인 칸 (없으면 빈칸) */
  field: string;
  /** 마우스 위치: [문서 너비에 대한 비율(0~1), 문서 위에서부터 px]. 문서 밖이면 null */
  cursor: [number, number] | null;
};

/** 받은 마우스 위치가 올바르면 그대로, 아니면 null */
export function cleanCursor(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [x, y] = v.map(Number);
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 100000 ? [Math.round(x * 1000) / 1000, Math.round(y)] : null;
}

export const VALUE_MAX = 4000;
/** 한 문서의 칸 수 상한 (학교 한글 양식은 칸이 7,000개쯤이라 넉넉히) */
export const MAX_FIELDS = 12000;
export const isFieldKey = (k: unknown): k is string => typeof k === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(k);
export const isDocId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{6,32}$/.test(v);
export const newDocId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const newSectionId = () => Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------- 병합

/** a → b 로 바뀐 한 덩어리: a 의 [start, end) 를 text 로 바꿈 (앞뒤 같은 부분을 빼고 남은 곳) */
export function diffRegion(a: string, b: string) {
  const max = Math.min(a.length, b.length);
  let p = 0;
  while (p < max && a[p] === b[p]) p++;
  let s = 0;
  while (s < max - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return { start: p, end: a.length - s, text: b.slice(p, b.length - s) };
}

/** 같은 원본(base)에서 두 사람이 각각 고친 글을 합침. 고친 곳이 겹치면 mine(나중에 저장한 쪽)을 씀 */
export function merge3(base: string, mine: string, theirs: string): string {
  if (mine === base || mine === theirs) return theirs;
  if (theirs === base) return mine;
  const m = diffRegion(base, mine);
  const t = diffRegion(base, theirs);
  if (m.end <= t.start && !(m.start === t.start && m.end === t.end)) {
    return base.slice(0, m.start) + m.text + base.slice(m.end, t.start) + t.text + base.slice(t.end);
  }
  if (t.end <= m.start) {
    return base.slice(0, t.start) + t.text + base.slice(t.end, m.start) + m.text + base.slice(m.end);
  }
  return mine;
}

export const isListKey = (k: string) => k.endsWith("List");

export function parseList(v: string | undefined): string[] {
  try {
    const a = JSON.parse(v || "[]") as unknown;
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && /^[a-z0-9]{1,12}$/.test(x)) : [];
  } catch {
    return [];
  }
}

/** 목록 칸 합치기: 상대가 정한 순서를 따르고, 내가 더한 것은 뒤에 붙이고, 둘 중 누구든 지운 것은 지움 */
export function mergeList(base: string, mine: string, theirs: string): string {
  const b = parseList(base);
  const m = parseList(mine);
  const t = parseList(theirs);
  const removed = new Set([...b.filter((x) => !m.includes(x)), ...b.filter((x) => !t.includes(x))]);
  const out = t.filter((x) => !removed.has(x));
  for (const x of m) if (!removed.has(x) && !out.includes(x)) out.push(x);
  return JSON.stringify(out);
}

export const mergeField = (key: string, base: string, mine: string, theirs: string) =>
  isListKey(key) ? mergeList(base, mine, theirs) : merge3(base, mine, theirs);

// ---------------------------------------------------------------- 문서 모양

export type SectionKind = "subject" | "life";

/** 교과 영역의 월별 학습 계획 칸 수 */
export const MONTH_ROWS = 4;
/** 학기에 따른 월별 계획의 달 */
export const monthsFor = (semester: string) => (semester === "1" ? ["3", "4", "5", "6~7"] : ["8~9", "10", "11", "12~1"]);

/** 처음 만들 때 단기목표(성취기준) 줄 수 */
export const DEFAULT_ROWS = 10;
export const MAX_ROWS = 40;

/** 교과 · 생활 영역 칸 이름 */
export const sk = (sec: string, name: string) => `s.${sec}.${name}`;

/** 지금 학년도 · 학기 (3~7월은 1학기, 8월~다음 해 2월은 2학기) */
export function currentTerm(now = new Date()) {
  const m = now.getMonth() + 1;
  const year = m < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return { year: String(year), semester: m >= 3 && m < 8 ? "1" : "2" };
}

// ---------------------------------------------------------------- 학생

/**
 * 문서 하나는 한 학년도 · 학기의 개별화교육계획이고, 그 안에 학생 여러 명이 들어 있음 (학교 한글 파일과 같은 구성).
 * 학생마다의 칸은 "st.<학생 id>.<칸>" 이름이고, 교과 · 생활 영역(s.<영역 id>.*)은 id 가 따로라 그대로 씀.
 * 학생 목록(studentList)이 없는 예전 문서(학생 한 명짜리)는 학생 id 가 빈 글자인 학생 한 명으로 봄.
 */
export const studentKey = (sid: string, k: string) => (sid ? `st.${sid}.${k}` : k);

/** 문서 전체에 하나뿐인 칸 */
export const DOC_KEYS = new Set(["year", "semester", "school", "studentList", "form"]);

/** 문서에 든 학생 id 들 */
export const studentIds = (f: IepFields): string[] => ("studentList" in f ? parseList(f.studentList) : [""]);

export type NewStudent = { grade: string; cls: string; name: string; subjects: string[] };

/** 학생 한 명을 더할 때의 처음 칸들 (교과 영역들 + 일상생활적응 영역) */
export function studentFields(sid: string, s: NewStudent): IepFields {
  const k = (name: string) => studentKey(sid, name);
  const f: IepFields = {
    [k("name")]: s.name,
    [k("grade")]: s.grade,
    [k("classNo")]: s.cls,
    [k("unit")]: s.grade && s.cls ? `${s.grade}학년 ${s.cls}반` : "",
  };
  const list: string[] = [];
  for (const subject of s.subjects.length ? s.subjects : ["국어", "수학"]) {
    const id = newSectionId();
    list.push(id);
    f[sk(id, "kind")] = "subject";
    f[sk(id, "subject")] = subject;
    f[sk(id, "rows")] = String(DEFAULT_ROWS);
  }
  const life = newSectionId();
  list.push(life);
  f[sk(life, "kind")] = "life";
  f[sk(life, "rows")] = String(DEFAULT_ROWS);
  f[k("sectionList")] = JSON.stringify(list);
  return f;
}

/** 학교 한글 양식(public/templates/iep-form.hwp)을 그대로 고치는 문서임을 나타내는 값 */
export const FORM_ID = "iep-form";

/** 새 문서(한 학년도 · 학기, 학교 한글 양식을 그대로 고침)의 처음 내용. 양식 칸은 고친 것만 저장함 */
export const formFields = (year: string, semester: string): IepFields => ({ school: "월계중학교", year, semester, form: FORM_ID });

/** 양식 글 속 "2026학년도 2학기" 를 이 문서의 학년도 · 학기로 */
export const withTerm = (text: string, year: string, semester: string) =>
  /^\d{4}$/.test(year) && /^\d$/.test(semester) ? text.replace(/\d{4}(\s*)학년도(\s*)\d(\s*)학기/g, `${year}$1학년도$2${semester}$3학기`) : text;

/** 새 문서(한 학년도 · 학기, 직접 만든 양식)의 처음 내용 */
export function initialFields(input: { year: string; semester: string; students: NewStudent[] }): IepFields {
  const f: IepFields = { school: "월계중학교", year: input.year, semester: input.semester };
  const ids: string[] = [];
  for (const s of input.students) {
    const sid = newSectionId();
    ids.push(sid);
    Object.assign(f, studentFields(sid, s));
  }
  f.studentList = JSON.stringify(ids);
  return f;
}

/** 문서 내용에서 목록에 보여 줄 요약 칸 (학년도 · 학기. 예전 학생 한 명짜리 문서는 학생도) */
export const metaFromFields = (f: IepFields) => ({
  year: f.year ?? "",
  semester: f.semester ?? "",
  grade: f.grade ?? "",
  cls: f.classNo ?? "",
  name: f.name ?? "",
});

export const docTitle = (m: Pick<IepMeta, "year" | "semester" | "grade" | "cls" | "name">) =>
  m.name || m.grade
    ? `${m.year ? `${m.year}학년도 ` : ""}${m.semester ? `${m.semester}학기 ` : ""}${m.grade && m.cls ? `${m.grade}-${m.cls} ` : ""}${m.name || "이름 없음"}`
    : `${m.year ? `${m.year}학년도 ` : ""}${m.semester ? `${m.semester}학기 ` : ""}개별화교육계획`;

/** 받은 칸들 중 올바른 것만 길이를 맞춰 받음 */
export function sanitizeFields(input: unknown): IepFields {
  const out: IepFields = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (isFieldKey(k) && typeof v === "string") out[k] = v.slice(0, VALUE_MAX);
    if (Object.keys(out).length >= MAX_FIELDS) break;
  }
  return out;
}
