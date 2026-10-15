"use client";

import { teacherLabel, titleFor, type TemplateSettings } from "@/lib/timetable";
import { RefreshIcon } from "./icons";
import type { SettingsErrors } from "./settings";

type Props = {
  settings: TemplateSettings | null;
  defaults: TemplateSettings | null;
  loadError: string | null;
  onChange: (s: TemplateSettings) => void;
  errors: SettingsErrors;
};

const field =
  "h-11 w-full rounded-lg border bg-white px-3 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

export default function SettingsForm({ settings, defaults, loadError, onChange, errors }: Props) {
  if (loadError) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {loadError}
      </p>
    );
  }
  if (!settings) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="기본 정보를 불러오는 중">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shimmer relative h-11 overflow-hidden rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  const set = (patch: Partial<TemplateSettings>) => onChange({ ...settings, ...patch });
  const setTeacher = (i: number, patch: { name?: string; room?: string }) =>
    set({ teachers: settings.teachers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const isDefault = defaults && JSON.stringify(defaults) === JSON.stringify(settings);

  return (
    <div className="space-y-7">
      {/* 문서 머리말 미리보기 */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
        <p className="text-xs font-semibold text-slate-400">문서 머리말 미리보기</p>
        <p className="mt-2 text-lg font-bold text-slate-900 underline decoration-1 underline-offset-4">
          {titleFor(settings)}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-700">
          {settings.teachers.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              <span
                className="h-4 w-6 rounded-sm ring-1 ring-inset ring-black/10"
                style={{ background: t.color || "#e2e8f0" }}
                aria-hidden="true"
              />
              {t.name.trim() ? teacherLabel({ ...t, name: t.name.trim(), room: t.room.trim() }) : "(이름 없음)"}
            </span>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-800">학년도 · 학기</legend>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <div className="w-40">
            <div className="relative">
              <input
                aria-label="학년도"
                aria-invalid={errors.has("year")}
                inputMode="numeric"
                autoComplete="off"
                value={settings.year}
                onChange={(e) => set({ year: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                className={`${field} pr-14 ${errors.has("year") ? "border-red-300" : "border-slate-200"}`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                학년도
              </span>
            </div>
          </div>
          <div role="radiogroup" aria-label="학기" className="inline-flex rounded-lg bg-slate-100 p-1">
            {["1", "2"].map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={settings.term === t}
                onClick={() => set({ term: t })}
                className={`h-9 rounded-md px-5 text-sm font-semibold transition ${
                  settings.term === t ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t}학기
              </button>
            ))}
          </div>
        </div>
        {errors.has("year") && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.get("year")}</p>}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-800">특수학급 선생님</legend>
        <p className="mt-0.5 text-xs text-slate-500">색상은 시간표에서 각 선생님 수업을 구분하는 칸 색이에요.</p>
        <ul className="mt-3 space-y-3">
          {settings.teachers.map((t, i) => {
            const err = errors.get(`teacher-${i}`);
            return (
              <li key={i}>
                <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 sm:gap-3">
                  <span
                    className="h-7 w-7 rounded-md ring-1 ring-inset ring-black/10"
                    style={{ background: t.color || "#e2e8f0" }}
                    title={`선생님 ${i + 1} 색상`}
                  />
                  <div className="relative">
                    <input
                      aria-label={`선생님 ${i + 1} 이름`}
                      aria-invalid={!!err}
                      autoComplete="off"
                      placeholder="이름"
                      value={t.name}
                      onChange={(e) => setTeacher(i, { name: e.target.value })}
                      className={`${field} pr-16 ${err ? "border-red-300" : "border-slate-200"}`}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      선생님
                    </span>
                  </div>
                  <input
                    aria-label={`선생님 ${i + 1} 교실`}
                    autoComplete="off"
                    placeholder="교실 (예: 느티나무 1)"
                    value={t.room}
                    onChange={(e) => setTeacher(i, { room: e.target.value })}
                    className={`${field} border-slate-200`}
                  />
                </div>
                {err && <p className="mt-1.5 pl-9 text-xs font-medium text-red-600 sm:pl-10">{err}</p>}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>바꾼 내용은 이 브라우저에 자동 저장돼요.</span>
        {defaults && !isDefault && (
          <button
            type="button"
            onClick={() => onChange(defaults)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
            양식 기본값으로
          </button>
        )}
      </div>
    </div>
  );
}
