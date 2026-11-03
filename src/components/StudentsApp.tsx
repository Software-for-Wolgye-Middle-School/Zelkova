"use client";

import { useMemo, useState, type FormEvent } from "react";
import { PlusIcon, TrashIcon } from "./icons";
import { SUBJECT_ON } from "./StudentForm";
import { DEFAULT_SUBJECTS, GRADES, newRow, SUBJECTS, validateRows, type StudentRow } from "./students";

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 반은 1~4반 중에서 고름 */
const CLASSES = ["1", "2", "3", "4"];

const isBlank = (r: StudentRow) => !r.name.trim() && !r.cls.trim();

/** 학생 정보를 등록 · 삭제 · 조회하는 화면. 여기서 등록한 학생은 시간표 · 칭찬통장 · 이름표에서 바로 불러와 써요. */
export default function StudentsApp({ rows, onRowsChange }: { rows: StudentRow[]; onRowsChange: (rows: StudentRow[]) => void }) {
  const [grade, setGrade] = useState("1");
  const [cls, setCls] = useState("1");
  const [name, setName] = useState("");
  const [subjects, setSubjects] = useState<string[]>([...DEFAULT_SUBJECTS]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const registered = useMemo(() => rows.filter((r) => !isBlank(r)), [rows]);
  const invalid = useMemo(() => validateRows(registered).errors, [registered]);

  const shown = useMemo(() => {
    const q = query.trim().replace(/\s+/g, "");
    const list = [...registered].sort((a, b) => Number(a.grade) - Number(b.grade) || Number(a.cls) - Number(b.cls) || a.name.localeCompare(b.name, "ko"));
    return q ? list.filter((r) => `${r.grade}학년${r.cls}반${r.grade}-${r.cls}${r.name}`.includes(q)) : list;
  }, [registered, query]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const row: StudentRow = { ...newRow(), grade, cls: cls.trim(), name: name.trim().replace(/\s+/g, " "), subjects };
    const { errors } = validateRows([row]);
    const err = errors.get(row.id);
    if (err) return setError(err.cls ?? err.name ?? err.subjects ?? "입력을 확인해 주세요");
    if (registered.some((r) => r.grade === row.grade && Number(r.cls) === Number(row.cls) && r.name.trim() === row.name)) {
      return setError(`${grade}학년 ${row.cls}반 ${row.name} 학생은 이미 등록되어 있어요`);
    }
    setError(null);
    onRowsChange([...registered, row]);
    setName(""); // 같은 반 학생을 이어서 등록하기 쉽도록 학년 · 반 · 과목은 그대로 둠
    document.getElementById("st-name")?.focus();
  };

  const remove = (id: string) => {
    const rest = rows.filter((r) => r.id !== id && !isBlank(r));
    onRowsChange(rest.length ? rest : [newRow()]);
  };

  /** 이미 등록한 학생의 학년 · 반 · 과목을 고침 (이름은 그대로) */
  const update = (id: string, patch: Partial<Pick<StudentRow, "grade" | "cls" | "subjects">>) => {
    const target = registered.find((r) => r.id === id);
    if (!target) return;
    const next = { ...target, ...patch };
    if (registered.some((r) => r.id !== id && r.grade === next.grade && Number(r.cls) === Number(next.cls) && r.name.trim() === next.name.trim())) {
      return setError(`${next.grade}학년 ${next.cls}반 ${next.name} 학생이 이미 있어서 바꿀 수 없어요`);
    }
    setError(null);
    onRowsChange(registered.map((r) => (r.id === id ? next : r)));
  };

  const toggleRowSubject = (r: StudentRow, s: string) => {
    if (r.subjects.includes(s) && r.subjects.length === 1) return setError("과목은 하나 이상 있어야 해요"); // 비우지 않도록
    update(r.id, { subjects: r.subjects.includes(s) ? r.subjects.filter((x) => x !== s) : SUBJECTS.filter((x) => x === s || r.subjects.includes(x)) });
  };

  const clearAll = () => {
    onRowsChange([newRow()]);
    setConfirmClear(false);
  };

  const toggleSubject = (s: string) =>
    setSubjects((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : SUBJECTS.filter((x) => x === s || cur.includes(x))));

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">학생 정보 관리하기</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          학생을 한 번만 등록해 두면 시간표 · 칭찬통장 · 이름표에서 바로 불러와 쓸 수 있어요.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <form onSubmit={submit} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-bold text-slate-900">학생 등록</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">학년</span>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className={field}>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}학년
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">반</span>
              <select value={cls} onChange={(e) => setCls(e.target.value)} className={field}>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}반
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">이름</span>
            <input
              id="st-name"
              value={name}
              maxLength={10}
              autoComplete="off"
              placeholder="예: 하초현"
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </label>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">수강 과목 (시간표에 쓰여요)</span>
            <div className="flex gap-1.5">
              {SUBJECTS.map((s) => {
                const on = subjects.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSubject(s)}
                    className={`h-10 flex-1 rounded-lg px-3 text-sm font-semibold ring-1 ring-inset transition ${
                      on ? SUBJECT_ON[s] : "bg-white text-slate-400 ring-slate-200 hover:text-slate-600"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700"
          >
            <PlusIcon className="h-5 w-5" />
            등록하기
          </button>
        </form>

        <section aria-label="등록된 학생" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">
              등록된 학생 <span className="text-indigo-600">{registered.length}명</span>
            </h2>
            {registered.length > 0 &&
              (confirmClear ? (
                <span className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600">모두 삭제할까요?</span>
                  <button type="button" onClick={clearAll} className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700">
                    삭제
                  </button>
                  <button type="button" onClick={() => setConfirmClear(false)} className="rounded-lg px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-100">
                    취소
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmClear(true)} className="text-sm font-semibold text-slate-500 hover:text-red-600">
                  전체 삭제
                </button>
              ))}
          </div>

          {registered.length > 0 && (
            <input
              type="search"
              value={query}
              aria-label="학생 찾기"
              placeholder="이름 · 학년 · 반으로 찾기 (예: 2-3, 하초현)"
              onChange={(e) => setQuery(e.target.value)}
              className={`${field} mb-3`}
            />
          )}

          {registered.length === 0 ? (
            <p className="py-12 text-center text-[15px] text-slate-500">아직 등록된 학생이 없어요. 왼쪽에서 학생을 등록해 보세요.</p>
          ) : shown.length === 0 ? (
            <p className="py-12 text-center text-[15px] text-slate-500">찾는 학생이 없어요.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shown.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <select
                    value={r.grade}
                    aria-label={`${r.name} 학년`}
                    onChange={(e) => update(r.id, { grade: e.target.value })}
                    className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}학년
                      </option>
                    ))}
                  </select>
                  <select
                    value={r.cls}
                    aria-label={`${r.name} 반`}
                    onChange={(e) => update(r.id, { cls: e.target.value })}
                    className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  >
                    {(CLASSES.includes(r.cls) ? CLASSES : [...CLASSES, r.cls]).map((c) => (
                      <option key={c} value={c}>
                        {c}반
                      </option>
                    ))}
                  </select>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900">
                    {r.name}
                    {invalid.has(r.id) && <span className="ml-2 text-xs font-medium text-red-500">정보를 확인해 주세요</span>}
                  </span>
                  <div role="group" aria-label={`${r.name} 수강 과목`} className="flex gap-1.5">
                    {SUBJECTS.map((s) => {
                      const on = r.subjects.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleRowSubject(r, s)}
                          className={`h-9 rounded-lg px-2.5 text-sm font-semibold ring-1 ring-inset transition ${
                            on ? SUBJECT_ON[s] : "bg-white text-slate-400 ring-slate-200 hover:text-slate-600"
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    aria-label={`${r.name} 삭제`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <TrashIcon className="h-4.5 w-4.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
