import type { TemplateSettings } from "@/lib/timetable";

/** key: "year" 또는 `teacher-${i}` */
export type SettingsErrors = Map<string, string>;

export function validateSettings(s: TemplateSettings): SettingsErrors {
  const errors: SettingsErrors = new Map();
  const year = Number(s.year);
  if (!/^\d{4}$/.test(s.year) || year < 2000 || year > 2100) errors.set("year", "학년도를 네 자리 숫자로 입력해 주세요");
  s.teachers.forEach((t, i) => {
    if (!t.name.trim()) errors.set(`teacher-${i}`, "선생님 이름을 입력해 주세요");
  });
  return errors;
}

/** 공백 정리 */
export function cleanSettings(s: TemplateSettings): TemplateSettings {
  return {
    year: s.year.trim(),
    term: s.term,
    teachers: s.teachers.map((t) => ({ ...t, name: t.name.trim(), room: t.room.trim() })),
  };
}

// ---------------------------------------------------------------- 브라우저에 자동 저장
const STORAGE_KEY = "zelkova.settings.v1";

type Saved = { year?: unknown; term?: unknown; teachers?: { name?: unknown; room?: unknown }[] };

/** 템플릿 기본값 위에 지난번 저장한 값을 덮어씀 (선생님 수와 색상은 템플릿 기준) */
export function loadSettings(defaults: TemplateSettings): TemplateSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Saved;
    return {
      year: typeof saved.year === "string" ? saved.year : defaults.year,
      term: saved.term === "1" || saved.term === "2" ? saved.term : defaults.term,
      teachers: defaults.teachers.map((t, i) => {
        const st = Array.isArray(saved.teachers) ? saved.teachers[i] : undefined;
        return {
          ...t,
          name: typeof st?.name === "string" ? st.name : t.name,
          room: typeof st?.room === "string" ? st.room : t.room,
        };
      }),
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(s: TemplateSettings) {
  try {
    const data = { year: s.year, term: s.term, teachers: s.teachers.map(({ name, room }) => ({ name, room })) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 저장하지 못해도 입력은 계속할 수 있음
  }
}
