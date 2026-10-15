"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { PlusIcon, TrashIcon } from "./icons";
import { GRADES, newRow, SUBJECTS, type RowErrors, type StudentRow } from "./students";

const SUBJECT_ON: Record<string, string> = {
  국어: "bg-rose-50 text-rose-700 ring-rose-300",
  영어: "bg-sky-50 text-sky-700 ring-sky-300",
  수학: "bg-emerald-50 text-emerald-700 ring-emerald-300",
};

type Props = {
  rows: StudentRow[];
  onChange: (rows: StudentRow[]) => void;
  errors: Map<string, RowErrors>;
  showErrors: boolean;
  studentCount: number;
};

const field =
  "h-10 w-full rounded-lg border bg-white px-2.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

export default function StudentForm({ rows, onChange, errors, showErrors, studentCount }: Props) {
  const focusId = useRef<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // 새로 추가한 줄의 '반' 칸으로 바로 이동
  useEffect(() => {
    if (!focusId.current) return;
    document.querySelector<HTMLInputElement>(`[data-row="${focusId.current}"] input[name="cls"]`)?.focus();
    focusId.current = null;
  });

  const update = (id: string, patch: Partial<StudentRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () => {
    const row = newRow(rows[rows.length - 1]);
    focusId.current = row.id;
    onChange([...rows, row]);
  };

  const removeRow = (id: string) => {
    const rest = rows.filter((r) => r.id !== id);
    onChange(rest.length ? rest : [newRow()]);
  };

  const toggleSubject = (r: StudentRow, s: string) =>
    update(r.id, {
      subjects: r.subjects.includes(s)
        ? r.subjects.filter((x) => x !== s)
        : SUBJECTS.filter((x) => x === s || r.subjects.includes(x)),
    });

  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return; // 한글 조합 중 Enter 는 무시
    e.preventDefault();
    if (index === rows.length - 1) addRow();
    else document.querySelector<HTMLInputElement>(`[data-row="${rows[index + 1].id}"] input[name="cls"]`)?.focus();
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          입력한 학생 <span className="font-semibold text-slate-900">{studentCount}명</span>
          <span className="mx-1.5 text-slate-300">·</span>이 브라우저에 자동 저장돼요
        </p>
        {confirmClear ? (
          <span className="flex items-center gap-1 text-sm">
            <span className="text-slate-600">모두 지울까요?</span>
            <button
              type="button"
              onClick={() => {
                onChange([newRow()]);
                setConfirmClear(false);
              }}
              className="rounded-md px-2 py-1 font-semibold text-red-600 hover:bg-red-50"
            >
              지우기
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="rounded-md px-2 py-1 font-semibold text-slate-500 hover:bg-slate-100"
            >
              취소
            </button>
          </span>
        ) : (
          studentCount > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              모두 지우기
            </button>
          )
        )}
      </div>

      <div className="rounded-2xl border border-slate-200">
        <div
          className="hidden grid-cols-[2rem_5.5rem_5rem_minmax(0,1fr)_auto_2.5rem] gap-2 rounded-t-2xl border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 sm:grid"
          aria-hidden="true"
        >
          <span className="text-center">#</span>
          <span>학년</span>
          <span>반</span>
          <span>이름</span>
          <span>수강 과목</span>
          <span />
        </div>

        <ul className="divide-y divide-slate-100">
          {rows.map((r, i) => {
            const e = showErrors ? errors.get(r.id) : undefined;
            const message = e && [e.cls, e.name, e.subjects].filter(Boolean).join(" · ");
            return (
              <li key={r.id} data-row={r.id} className={`px-3 py-3 ${e ? "bg-red-50/40" : ""}`}>
                <div className="grid grid-cols-[4.5rem_4.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 sm:grid-cols-[2rem_5.5rem_5rem_minmax(0,1fr)_auto_2.5rem]">
                  <span className="hidden text-center text-sm font-medium text-slate-400 sm:block">{i + 1}</span>
                  <select
                    aria-label={`${i + 1}번 학생 학년`}
                    value={r.grade}
                    onChange={(ev) => update(r.id, { grade: ev.target.value })}
                    className={`${field} border-slate-200 pr-1`}
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}학년
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <input
                      name="cls"
                      aria-label={`${i + 1}번 학생 반`}
                      aria-invalid={!!e?.cls}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="반"
                      value={r.cls}
                      onChange={(ev) => update(r.id, { cls: ev.target.value.replace(/[^0-9]/g, "").slice(0, 2) })}
                      className={`${field} pr-7 ${e?.cls ? "border-red-300" : "border-slate-200"}`}
                    />
                    {r.cls && (
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                        반
                      </span>
                    )}
                  </div>
                  <input
                    name="name"
                    aria-label={`${i + 1}번 학생 이름`}
                    aria-invalid={!!e?.name}
                    autoComplete="off"
                    placeholder="이름"
                    value={r.name}
                    onChange={(ev) => update(r.id, { name: ev.target.value })}
                    onKeyDown={(ev) => onNameKeyDown(ev, i)}
                    className={`${field} ${e?.name ? "border-red-300" : "border-slate-200"}`}
                  />
                  <div
                    role="group"
                    aria-label={`${i + 1}번 학생 수강 과목`}
                    className="col-span-3 row-start-2 flex gap-1.5 sm:col-span-1 sm:row-start-auto"
                  >
                    {SUBJECTS.map((s) => {
                      const on = r.subjects.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleSubject(r, s)}
                          className={`h-10 flex-1 rounded-lg px-3 text-sm font-semibold ring-1 ring-inset transition sm:flex-none ${
                            on ? SUBJECT_ON[s] : "bg-white text-slate-400 ring-slate-200 hover:text-slate-600"
                          } ${e?.subjects ? "ring-red-300" : ""}`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    aria-label={`${i + 1}번 학생 삭제`}
                    className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                {message && (
                  <p role="alert" className="mt-1.5 text-xs font-medium text-red-600 sm:pl-10">
                    {message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={addRow}
          className="flex w-full items-center justify-center gap-1.5 rounded-b-2xl border-t border-dashed border-slate-200 py-3 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50/60"
        >
          <PlusIcon className="h-4 w-4" />
          학생 추가
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">이름 칸에서 Enter 를 누르면 다음 학생 줄로 넘어가요.</p>
    </div>
  );
}
