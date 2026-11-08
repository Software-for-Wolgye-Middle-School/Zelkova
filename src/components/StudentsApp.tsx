"use client";

import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { checkAuth, logout } from "./auth";
import { LockIcon, PlusIcon, TrashIcon } from "./icons";
import ConfirmDialog from "./ConfirmDialog";
import LoginOverlay from "./LoginOverlay";
import { useShake } from "./useShake";
import { SUBJECT_ON } from "./StudentForm";
import { CLASSES, DEFAULT_SUBJECTS, GRADES, isBlank, newRow, SUBJECTS, validateRows, type StudentRow } from "./students";

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";


/** 목록 순서: 최근 등록한 학생이 위 · 이름 가나다순 · 학년마다 묶어서 (학년 안에서는 1반, 2반 … 순) */
type Sort = "recent" | "name" | "grade";
const SORTS: [Sort, string][] = [
  ["recent", "최근 등록순"],
  ["name", "이름순"],
  ["grade", "학년별"],
];
const gradeOf = (r: StudentRow) => `${r.grade}학년`;

type Props = { rows: StudentRow[]; onRowsChange: (rows: StudentRow[]) => void };

/**
 * 학생 정보 관리: 아이디 · 비밀번호로 로그인해야 볼 수 있음. 잠겨 있으면 화면 가운데에 로그인 창을 띄우고 뒤는 흐리게 함.
 * onAuthed: 로그인한 뒤 서버의 학생 목록을 다시 불러옴 · onExit: 메인 화면으로
 */
export default function StudentsApp({ rows, onRowsChange, onAuthed, onExit }: Props & { onAuthed: () => void; onExit: () => void }) {
  const [auth, setAuth] = useState<"checking" | "locked" | "open">("checking");

  useEffect(() => {
    let cancelled = false;
    checkAuth().then((ok) => !cancelled && setAuth(ok ? "open" : "locked"));
    return () => {
      cancelled = true;
    };
  }, []);

  const lock = async () => {
    await logout();
    setAuth("locked");
  };

  if (auth === "open") return <StudentsPanel rows={rows} onRowsChange={onRowsChange} onLock={lock} />;
  // 잠겨 있을 때는 학생 정보 없이 빈 화면만 흐리게 보여 줌
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none select-none">
        <StudentsPanel rows={[]} onRowsChange={() => {}} />
      </div>
      <LoginOverlay
        checking={auth === "checking"}
        onSuccess={() => {
          setAuth("open");
          onAuthed();
        }}
        onExit={onExit}
      />
    </>
  );
}

/** 학생 정보를 등록 · 삭제 · 조회하는 화면. 여기서 등록한 학생은 시간표 · 칭찬통장 · 이름표에서 바로 불러와 써요. */
function StudentsPanel({ rows, onRowsChange, onLock }: Props & { onLock?: () => void }) {
  const [grade, setGrade] = useState("1");
  const [cls, setCls] = useState("1");
  const [name, setName] = useState("");
  const [subjects, setSubjects] = useState<string[]>([...DEFAULT_SUBJECTS]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");
  const registerShake = useShake();
  /** 방금 등록한 학생 (목록에서 색칠해 보여 줌) */
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const registered = useMemo(() => rows.filter((r) => !isBlank(r)), [rows]);
  const invalid = useMemo(() => validateRows(registered).errors, [registered]);

  const shown = useMemo(() => {
    const q = query.trim().replace(/\s+/g, "");
    // 등록한 학생은 목록 끝에 붙으므로, 거꾸로 하면 최근에 등록한 학생이 위로 옴
    const byClass = (a: StudentRow, b: StudentRow) => Number(a.grade) - Number(b.grade) || Number(a.cls) - Number(b.cls);
    const byName = (a: StudentRow, b: StudentRow) => a.name.localeCompare(b.name, "ko");
    const list =
      sort === "recent"
        ? [...registered].reverse()
        : sort === "name"
          ? [...registered].sort((a, b) => byName(a, b) || byClass(a, b))
          : [...registered].sort((a, b) => byClass(a, b) || byName(a, b));
    return q ? list.filter((r) => `${r.grade}학년${r.cls}반${r.grade}-${r.cls}${r.name}`.includes(q)) : list;
  }, [registered, query, sort]);

  // 방금 등록한 학생이 목록에서 보이도록
  useEffect(() => {
    if (justAdded) document.getElementById(`st-row-${justAdded}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [justAdded]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const row: StudentRow = { ...newRow(), grade, cls: cls.trim(), name: name.trim().replace(/\s+/g, " "), subjects };
    // 이름이 없으면 빈 줄로 보아 검사에서 빠지므로 따로 확인
    const err = row.name ? validateRows([row]).errors.get(row.id) : { name: "이름을 입력해 주세요" };
    const problem = err
      ? (err.cls ?? err.name ?? err.subjects ?? "입력을 확인해 주세요")
      : registered.some((r) => r.grade === row.grade && Number(r.cls) === Number(row.cls) && r.name.trim() === row.name)
        ? `${grade}학년 ${row.cls}반 ${row.name} 학생은 이미 등록되어 있어요`
        : null;
    if (problem) {
      setError(problem);
      return registerShake.shake();
    }
    setError(null);
    onRowsChange([...registered, row]);
    setJustAdded(row.id);
    setQuery(""); // 찾기로 걸러져 방금 등록한 학생이 안 보이는 일이 없도록
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
    setJustAdded(null);
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
              placeholder="예: 이순신"
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
            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 ${registerShake.shakeClass}`}
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
            <div className="flex items-center gap-3">
              {registered.length > 0 && (
                <button type="button" onClick={() => setConfirmClear(true)} className="text-sm font-semibold text-slate-500 hover:text-red-600">
                  전체 삭제
                </button>
              )}
              {onLock && (
                <button type="button" onClick={onLock} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600">
                  <LockIcon className="h-4 w-4" />
                  잠그기
                </button>
              )}
            </div>
          </div>

          {registered.length > 0 && (
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={query}
                aria-label="학생 찾기"
                placeholder="이름 · 학년 · 반으로 찾기 (예: 2-3, 이순신)"
                onChange={(e) => setQuery(e.target.value)}
                className={`${field} sm:flex-1`}
              />
              <div role="radiogroup" aria-label="목록 순서" className="inline-flex h-11 shrink-0 rounded-lg bg-slate-100 p-1">
                {SORTS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={sort === id}
                    onClick={() => setSort(id)}
                    className={`flex-1 whitespace-nowrap rounded-md px-3 text-sm font-semibold transition ${
                      sort === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {registered.length === 0 ? (
            <p className="py-12 text-center text-[15px] text-slate-500">아직 등록된 학생이 없어요. 왼쪽에서 학생을 등록해 보세요.</p>
          ) : shown.length === 0 ? (
            <p className="py-12 text-center text-[15px] text-slate-500">찾는 학생이 없어요.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shown.map((r, i) => (
                <Fragment key={r.id}>
                {sort === "grade" && gradeOf(r) !== (i > 0 ? gradeOf(shown[i - 1]) : "") && (
                  // 학년별로 볼 때 학년마다 머리글
                  <li className="-mx-2 border-none px-2 pb-1 pt-4 text-xs font-bold text-slate-700 first:pt-0">
                    {gradeOf(r)} <span className="font-medium text-slate-400">{shown.filter((x) => gradeOf(x) === gradeOf(r)).length}명</span>
                  </li>
                )}
                <li
                  id={`st-row-${r.id}`}
                  className={`-mx-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-2.5 transition-[background-color,box-shadow] duration-500 ${
                    r.id === justAdded ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200" : ""
                  }`}
                >
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
                    {r.id === justAdded && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">방금 등록</span>
                    )}
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
                </Fragment>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 페이지의 등장 애니메이션 안에 있으면 창이 화면 전체를 덮지 못하므로 body 에 바로 그림 */}
      {confirmClear && (
        <ConfirmDialog title="정말 전체 삭제할까요?" confirmLabel="전체 삭제" onConfirm={clearAll} onCancel={() => setConfirmClear(false)}>
          등록된 학생 {registered.length}명이 모두 지워져요.
          <br />
          지운 뒤에는 되돌릴 수 없어요.
        </ConfirmDialog>
      )}
    </div>
  );
}
