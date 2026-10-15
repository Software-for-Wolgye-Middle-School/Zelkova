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

// ---------------------------------------------------------------- 브라우저에 자동 저장
const STORAGE_KEY = "zelkova.students.v1";

export function loadRows(): StudentRow[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

export function saveRows(rows: StudentRow[]) {
  try {
    const data = rows.filter((r) => !isBlank(r)).map(({ grade, cls, name, subjects }) => ({ grade, cls, name, subjects }));
    if (data.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장하지 못해도 입력은 계속할 수 있음
  }
}
