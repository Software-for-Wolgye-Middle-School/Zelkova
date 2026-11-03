import type { Student } from "@/lib/timetable";

/** 화면에서 고를 수 있는 수강 과목 (특수학급 시간표의 순서와 같음) */
export const SUBJECTS = ["국어", "영어", "수학", "스포츠"] as const;
/** 새 학생 줄에 미리 선택되는 과목 */
export const DEFAULT_SUBJECTS: string[] = ["국어", "영어", "수학"];
export const GRADES = ["1", "2", "3"];

export type StudentRow = { id: string; grade: string; cls: string; name: string; subjects: string[] };
export type RowErrors = { cls?: string; name?: string; subjects?: string };

let seq = 0;
const newId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

/** 새 줄은 바로 위 학생의 학년을 이어받고, 과목은 국어 · 영어 · 수학이 선택된 상태로 시작 */
export function newRow(prev?: StudentRow): StudentRow {
  return { id: newId(), grade: prev?.grade ?? "1", cls: "", name: "", subjects: [...DEFAULT_SUBJECTS] };
}

const isBlank = (r: StudentRow) => !r.name.trim() && !r.cls.trim();

export function validateRows(rows: StudentRow[]) {
  const students: Student[] = [];
  const errors = new Map<string, RowErrors>();
  for (const r of rows) {
    if (isBlank(r)) continue; // 비어 있는 줄은 무시
    const e: RowErrors = {};
    const cls = Number(r.cls);
    if (!r.cls.trim()) e.cls = "반을 입력해 주세요";
    else if (!Number.isInteger(cls) || cls < 1 || cls > 30) e.cls = "반은 숫자로 입력해 주세요";
    if (!r.name.trim()) e.name = "이름을 입력해 주세요";
    if (r.subjects.length === 0) e.subjects = "과목을 하나 이상 골라 주세요";
    if (Object.keys(e).length) errors.set(r.id, e);
    else students.push({ grade: Number(r.grade), cls, name: r.name.trim(), subjects: [...r.subjects] });
  }
  return { students, errors };
}

/** 학생 정보 관리 → 시간표 방향으로만 반영: 등록한 학생이 새로 생기면 시간표 목록에 더하고, 지우면 시간표 목록에서도 뺌 (반대 방향은 없음) */
export function syncToTimetable(prevReg: StudentRow[], nextReg: StudentRow[], tt: StudentRow[]): StudentRow[] {
  const key = (r: StudentRow) => `${r.grade}|${Number(r.cls)}|${r.name.trim()}`;
  const map = (rows: StudentRow[]) => new Map(rows.filter((r) => !isBlank(r)).map((r) => [key(r), r]));
  const prev = map(prevReg);
  const next = map(nextReg);
  let out = tt.filter((r) => !isBlank(r) && !(prev.has(key(r)) && !next.has(key(r))));
  for (const [k, r] of next) {
    const old = prev.get(k);
    if (!old) {
      if (!out.some((x) => key(x) === k)) out = [...out, { ...r, id: newId(), subjects: [...r.subjects] }];
    } else if (old.subjects.join() !== r.subjects.join()) {
      out = out.map((x) => (key(x) === k ? { ...x, subjects: [...r.subjects] } : x));
    }
  }
  return out.length ? out : [newRow()];
}

// ---------------------------------------------------------------- 브라우저에 자동 저장
/** 학생 정보 관리에 등록한 학생 */
const STORAGE_KEY = "zelkova.students.v1";
/** 시간표 만들기에서 쓰는 학생 목록 (여기서 지워도 학생 정보 관리의 학생은 그대로) */
export const TIMETABLE_KEY = "zelkova.timetableStudents.v1";

export function loadRows(storageKey = STORAGE_KEY): StudentRow[] | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StudentRow>[];
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.map((d) => ({
      id: newId(),
      grade: GRADES.includes(String(d.grade)) ? String(d.grade) : "1",
      cls: String(d.cls ?? ""),
      name: String(d.name ?? ""),
      subjects: Array.isArray(d.subjects)
        ? SUBJECTS.filter((s) => d.subjects!.includes(s))
        : [...DEFAULT_SUBJECTS],
    }));
  } catch {
    return null;
  }
}

export function saveRows(rows: StudentRow[], storageKey = STORAGE_KEY) {
  try {
    const data = rows.filter((r) => !isBlank(r)).map(({ grade, cls, name, subjects }) => ({ grade, cls, name, subjects }));
    if (data.length) localStorage.setItem(storageKey, JSON.stringify(data));
    else localStorage.removeItem(storageKey);
  } catch {
    // 저장하지 못해도 입력은 계속할 수 있음
  }
}
