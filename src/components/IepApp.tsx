"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  currentTerm,
  DEFAULT_ROWS,
  diffRegion,
  docTitle,
  MAX_ROWS,
  MONTH_ROWS,
  monthsFor,
  newSectionId,
  parseList,
  sk,
  type IepMeta,
  type IepPresence,
} from "@/lib/iep";
import ConfirmDialog from "./ConfirmDialog";
import LoginOverlay from "./LoginOverlay";
import { ArrowLeftIcon, PlusIcon, Spinner, TrashIcon } from "./icons";
import { fetchServerRows, SUBJECTS, type StudentRow } from "./students";
import { IEP_STATUS_TEXT, useIepSync, type Me } from "./useIepSync";

/**
 * 특수학급 개별화교육계획 작성. 특수교사 두 분이 한 문서를 동시에 열어 고치면
 * 고친 칸이 곧바로 서버에 저장되고 서로의 화면에 1초 안에 나타남 (구글 문서처럼).
 * 다른 선생님이 입력 중인 칸에는 그 선생님 색 테두리와 이름이 보임.
 * 화면의 양식이 곧 인쇄 양식이라 「인쇄 · PDF 저장」을 누르면 학교 양식 모양 그대로 A4 로 나옴.
 */

// ---------------------------------------------------------------- 나 (다른 선생님 화면에 보일 이름과 색)

const ME_KEY = "zelkova:iep:me";
const COLORS = ["#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];
const colorFor = (name: string) => COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

function loadMyName() {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(ME_KEY) ?? "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------- 서버

async function fetchDocs(): Promise<{ kind: "ok"; docs: IepMeta[] } | { kind: "auth" | "fail" }> {
  try {
    const res = await fetch("/api/iep", { cache: "no-store" });
    if (res.status === 401) return { kind: "auth" };
    if (!res.ok) return { kind: "fail" };
    return { kind: "ok", docs: ((await res.json()) as { docs: IepMeta[] }).docs };
  } catch {
    return { kind: "fail" };
  }
}

const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  const d = new Date(t);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

// ---------------------------------------------------------------- 맨 바깥: 목록 ↔ 편집

export default function IepApp() {
  const [docs, setDocs] = useState<IepMeta[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "auth" | "fail">("loading");
  const [openId, setOpenId] = useState<string | null>(null);
  const [myName, setMyName] = useState(loadMyName);
  const [askName, setAskName] = useState<null | (() => void)>(null);

  const reload = useCallback(async () => {
    const r = await fetchDocs();
    if (r.kind === "ok") setDocs(r.docs);
    setState(r.kind);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void fetchDocs().then((r) => {
      if (cancelled) return;
      if (r.kind === "ok") setDocs(r.docs);
      setState(r.kind);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 이름을 아직 안 정했으면 먼저 묻고 나서 then 을 함 */
  const withName = (then: () => void) => (myName ? then() : setAskName(() => then));

  if (openId && myName) {
    return (
      <IepEditor
        docId={openId}
        myName={myName}
        onRename={() => setAskName(() => () => {})}
        onBack={() => {
          setOpenId(null);
          void reload();
        }}
        nameDialog={askName && <NameDialog initial={myName} onCancel={() => setAskName(null)} onSave={(n) => { setMyName(n); setAskName(null); }} />}
      />
    );
  }

  return (
    <div className="fade-up mx-auto max-w-3xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">개별화교육계획</h1>
        <p className="mt-1.5 text-sm text-slate-500">특수교사 선생님들이 한 문서를 동시에 열어 함께 작성해요. 고친 내용은 바로 서버에 저장돼요.</p>
      </div>
      <IepList
        docs={docs}
        state={state}
        myName={myName}
        onOpen={(id) => withName(() => setOpenId(id))}
        onCreated={(meta) => {
          setDocs((d) => [meta, ...(d ?? [])]);
          withName(() => setOpenId(meta.id));
        }}
        onDeleted={(id) => setDocs((d) => (d ?? []).filter((x) => x.id !== id))}
        onRename={() => setAskName(() => () => {})}
        onRetry={reload}
      />
      {state === "auth" && <LoginOverlay title="개별화교육계획" exitLabel="다시 불러오기" onExit={() => void reload()} onSuccess={() => void reload()} />}
      {askName && (
        <NameDialog
          initial={myName}
          onCancel={() => setAskName(null)}
          onSave={(n) => {
            setMyName(n);
            const then = askName;
            setAskName(null);
            then();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 이름 정하기

function NameDialog({ initial, onSave, onCancel }: { initial: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  const save = () => {
    const n = name.trim().slice(0, 10);
    if (!n) return;
    try {
      localStorage.setItem(ME_KEY, n);
    } catch {
      // 막힌 브라우저: 이번에만 씀
    }
    onSave(n);
  };
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/40 p-4 print:hidden" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="fade-up w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold text-slate-900">선생님 이름을 알려 주세요</h2>
        <p className="mt-1 text-sm text-slate-500">함께 편집하는 다른 선생님 화면에 이 이름으로 보여요. 이 컴퓨터에 기억해 둬요.</p>
        <input
          value={name}
          autoFocus
          maxLength={10}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 김민지"
          className="mt-4 h-11 w-full rounded-lg border border-slate-200 px-3 text-[15px] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        />
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={!name.trim()} className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400">
            확인
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- 문서 목록

function IepList({
  docs,
  state,
  myName,
  onOpen,
  onCreated,
  onDeleted,
  onRename,
  onRetry,
}: {
  docs: IepMeta[] | null;
  state: "loading" | "ok" | "auth" | "fail";
  myName: string;
  onOpen: (id: string) => void;
  onCreated: (meta: IepMeta) => void;
  onDeleted: (id: string) => void;
  onRename: () => void;
  onRetry: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<IepMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (m: IepMeta) => {
    setRemoving(null);
    try {
      const res = await fetch(`/api/iep?id=${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDeleted(m.id);
    } catch {
      setError("지우지 못했어요. 잠시 뒤 다시 해 주세요.");
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">작성한 계획</h2>
          <button type="button" onClick={onRename} className="mt-0.5 text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
            {myName ? `${myName} 선생님으로 편집해요 · 이름 바꾸기` : "편집할 때 쓸 이름 정하기"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700"
        >
          <PlusIcon className="h-4 w-4" />새 개별화교육계획
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <div className="mt-5">
        {state === "loading" && !docs ? (
          <div className="grid place-items-center py-10">
            <Spinner className="h-7 w-7 text-indigo-600" />
          </div>
        ) : state === "fail" && !docs ? (
          <div className="py-8 text-center text-sm text-slate-500">
            서버에 연결하지 못했어요.{" "}
            <button type="button" onClick={onRetry} className="font-semibold text-indigo-600 hover:underline">
              다시 불러오기
            </button>
          </div>
        ) : !docs?.length ? (
          <p className="rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-500">아직 작성한 계획이 없어요. 「새 개별화교육계획」을 눌러 시작해 보세요.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {docs.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => onOpen(m.id)} className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">{docTitle(m)}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {ago(m.updatedAt)} 고침{m.updatedBy ? ` · ${m.updatedBy} 선생님` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setRemoving(m)}
                  aria-label={`${docTitle(m)} 지우기`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <NewDocDialog
          by={myName}
          onCancel={() => setCreating(false)}
          onCreated={(m) => {
            setCreating(false);
            onCreated(m);
          }}
        />
      )}
      {removing && (
        <ConfirmDialog title="이 계획을 지울까요?" confirmLabel="지우기" onCancel={() => setRemoving(null)} onConfirm={() => void remove(removing)}>
          「{docTitle(removing)}」을 지우면 함께 편집하던 선생님 화면에서도 사라지고 되돌릴 수 없어요.
        </ConfirmDialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 새 문서

const inputCls = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

function NewDocDialog({ by, onCancel, onCreated }: { by: string; onCancel: () => void; onCreated: (m: IepMeta) => void }) {
  const term = currentTerm();
  const [year, setYear] = useState(term.year);
  const [semester, setSemester] = useState(term.semester);
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [grade, setGrade] = useState("");
  const [cls, setCls] = useState("");
  const [name, setName] = useState("");
  const [subjects, setSubjects] = useState<string[]>(["국어", "수학"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchServerRows().then((rows) => setStudents((rows ?? []).filter((r) => r.name.trim())));
  }, []);

  const pick = (key: string) => {
    const s = students?.find((r) => r.id === key);
    if (!s) return;
    setGrade(s.grade);
    setCls(s.cls);
    setName(s.name);
    if (s.subjects.length) setSubjects(s.subjects);
  };

  const create = async () => {
    if (!name.trim()) return setError("학생 이름을 입력해 주세요.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/iep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, semester, grade, cls, name, subjects, by }),
      });
      const data = (await res.json().catch(() => null)) as { doc?: IepMeta; error?: string } | null;
      if (!res.ok || !data?.doc) throw new Error(data?.error ?? "만들지 못했어요.");
      onCreated(data.doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "만들지 못했어요.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className="fade-up w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold text-slate-900">새 개별화교육계획</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">학년도</span>
            <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">학기</span>
            <select value={semester} onChange={(e) => setSemester(e.target.value)} className={inputCls}>
              <option value="1">1학기</option>
              <option value="2">2학기</option>
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">등록된 학생에서 고르기</span>
          <select defaultValue="" onChange={(e) => pick(e.target.value)} disabled={!students?.length} className={inputCls}>
            <option value="">{students === null ? "불러오는 중…" : students.length ? "학생을 고르면 아래 칸이 채워져요" : "등록된 학생이 없어요"}</option>
            {students?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.grade}학년 {s.cls}반 {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-3 grid grid-cols-[1fr_1fr_2fr] gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">학년</span>
            <input value={grade} onChange={(e) => setGrade(e.target.value.slice(0, 2))} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">반</span>
            <input value={cls} onChange={(e) => setCls(e.target.value.slice(0, 2))} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">학생 이름</span>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} className={inputCls} />
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-1.5 text-xs font-semibold text-slate-600">교과 영역 (나중에 더하거나 뺄 수 있어요)</legend>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => {
              const on = subjects.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSubjects((list) => (on ? list.filter((x) => x !== s) : [...list, s]))}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${on ? "bg-indigo-600 text-white ring-indigo-600" : "text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">일상생활적응 및 사회적 기술훈련 영역은 항상 들어가요.</p>
        </fieldset>

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-70">
            {busy && <Spinner className="h-4 w-4" />}
            만들기
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- 편집 화면

type Ctx = {
  values: Record<string, string>;
  set: (key: string, value: string) => void;
  focus: (key: string) => void;
  blur: (key: string) => void;
  compose: (key: string, on: boolean) => void;
  /** 칸 → 그 칸을 입력 중인 다른 선생님들 */
  who: Record<string, IepPresence[]>;
};
const IepCtx = createContext<Ctx | null>(null);
const useIep = () => useContext(IepCtx)!;

function IepEditor({ docId, myName, onBack, onRename, nameDialog }: { docId: string; myName: string; onBack: () => void; onRename: () => void; nameDialog: ReactNode }) {
  const [clientId] = useState(() => `c${Math.random().toString(36).slice(2, 10)}`);
  const me = useMemo<Me>(() => ({ id: clientId, name: myName, color: colorFor(myName) }), [clientId, myName]);
  const sync = useIepSync(docId, me);
  const { values, presence, status, detail, loaded, set, focus, blur, compose, moveCursor } = sync;
  const docRef = useRef<HTMLDivElement>(null);
  /** 마우스 위치를 문서 기준으로 (가로는 문서 너비 비율, 세로는 문서 맨 위에서부터 px) */
  const trackMouse = (e: ReactMouseEvent) => {
    const r = docRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    moveCursor([Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.max(0, e.clientY - r.top)]);
  };

  const who = useMemo(() => {
    const map: Record<string, IepPresence[]> = {};
    for (const p of presence) if (p.field) (map[p.field] ??= []).push(p);
    return map;
  }, [presence]);
  const ctx = useMemo<Ctx>(() => ({ values, set, focus, blur, compose, who }), [values, set, focus, blur, compose, who]);

  const sections = parseList(values.sectionList);
  const title = docTitle({ year: values.year ?? "", semester: values.semester ?? "", grade: values.grade ?? "", cls: values.classNo ?? "", name: values.name ?? "" });

  // 창 제목을 바꿔 인쇄 · PDF 저장 때 파일 이름이 되게 함
  useEffect(() => {
    const before = document.title;
    document.title = `개별화교육계획 - ${title}`;
    return () => {
      document.title = before;
    };
  }, [title]);

  const addSection = (kind: "subject" | "life") => {
    const id = newSectionId();
    set(sk(id, "kind"), kind);
    set(sk(id, "rows"), String(DEFAULT_ROWS));
    if (kind === "subject") set(sk(id, "subject"), "");
    set("sectionList", JSON.stringify([...sections, id]));
  };
  const removeSection = (id: string) => set("sectionList", JSON.stringify(sections.filter((s) => s !== id)));

  const people = [{ id: me.id, name: myName, color: me.color, field: "" }, ...presence];

  return (
    <IepCtx.Provider value={ctx}>
      <div className="iep-doc">
        {/* 위쪽 도구 막대 (인쇄할 때는 숨김) */}
        <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 print:hidden">
          <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-3">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
              <ArrowLeftIcon className="h-4 w-4" />
              목록
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-slate-900">{title}</p>
              <p aria-live="polite" className={`text-xs font-medium ${IEP_STATUS_TEXT[status].tone}`}>
                {IEP_STATUS_TEXT[status].text}
                {detail && status !== "live" && <span className="ml-1 opacity-80">({detail})</span>}
              </p>
            </div>
            {/* 지금 이 문서를 보고 있는 사람들 */}
            <div className="flex items-center">
              {people.map((p, i) => (
                <span
                  key={p.id}
                  title={i === 0 ? `나 (${p.name}) · 누르면 이름 바꾸기` : `${p.name} 선생님이 보고 있어요`}
                  onClick={i === 0 ? onRename : undefined}
                  className={`-ml-1.5 grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white ring-2 ring-white first:ml-0 ${i === 0 ? "cursor-pointer" : ""}`}
                  style={{ background: p.color }}
                >
                  {[...p.name][0]}
                </span>
              ))}
              {presence.length > 0 && <span className="ml-2 hidden text-xs font-medium text-slate-500 sm:inline">{presence.length + 1}명이 함께 편집 중</span>}
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!loaded}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              인쇄 · PDF 저장
            </button>
          </div>
        </div>

        {status === "gone" ? (
          <p className="mx-auto max-w-md rounded-xl bg-red-50 p-6 text-center text-sm text-red-700">다른 선생님이 이 문서를 지웠어요. 목록으로 돌아가 주세요.</p>
        ) : !loaded ? (
          <div className="grid place-items-center py-20">
            <Spinner className="h-8 w-8 text-indigo-600" />
          </div>
        ) : (
          <div ref={docRef} onMouseMove={trackMouse} onMouseLeave={() => moveCursor(null)} className="relative space-y-6 print:space-y-0">
            {/* 함께 편집하는 선생님의 마우스 */}
            {presence.map(
              (p) =>
                p.cursor && (
                  <div
                    key={p.id}
                    aria-hidden="true"
                    className="pointer-events-none absolute z-20 transition-[left,top] duration-300 ease-linear print:hidden"
                    style={{ left: `${p.cursor[0] * 100}%`, top: p.cursor[1] }}
                  >
                    <svg width="18" height="22" viewBox="0 0 18 22" className="drop-shadow">
                      <path d="M1 1l15 9.5-6.6 1.4L13 20l-3 1.2-3.6-8.1L1 17z" fill={p.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                    <span className="ml-3 -mt-1 block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white shadow" style={{ background: p.color }}>
                      {p.name}
                    </span>
                  </div>
                ),
            )}
            <CoverPage />
            <ProfilePage />
            {sections.map((id) =>
              values[sk(id, "kind")] === "life" ? (
                <LifeSection key={id} id={id} onRemove={() => removeSection(id)} />
              ) : (
                <SubjectSection key={id} id={id} onRemove={() => removeSection(id)} />
              ),
            )}
            <div className="mx-auto flex max-w-[210mm] flex-wrap justify-center gap-2 print:hidden">
              <button type="button" onClick={() => addSection("subject")} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                <PlusIcon className="h-4 w-4" />
                교과 영역 더하기
              </button>
              <button type="button" onClick={() => addSection("life")} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                <PlusIcon className="h-4 w-4" />
                일상생활적응 영역 더하기
              </button>
            </div>
          </div>
        )}
      </div>
      {nameDialog}
    </IepCtx.Provider>
  );
}

// ---------------------------------------------------------------- 입력 칸

/**
 * 양식의 칸 하나. 글이 길어지면 칸이 아래로 늘어남.
 * 다른 선생님이 같은 칸을 고쳐 글이 바뀌어도 내 커서가 엉뚱한 곳으로 튀지 않게 커서 위치를 옮겨 줌.
 */
function F({ k, className = "", center = false, single = false, ph = "", minRows = 1 }: { k: string; className?: string; center?: boolean; single?: boolean; ph?: string; minRows?: number }) {
  const { values, set, focus, blur, compose, who } = useIep();
  const value = values[k] ?? "";
  const ref = useRef<HTMLTextAreaElement>(null);
  /** 내가 마지막으로 입력한 값 (이 값으로 바뀐 것은 내 입력이라 커서를 건드리지 않음) */
  const typed = useRef(value);
  const shown = useRef(value);
  const sel = useRef<[number, number]>([0, 0]);
  const others = who[k];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 글 길이에 맞춰 높이 (field-sizing 을 모르는 브라우저용)
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    const prev = shown.current;
    shown.current = value;
    if (value === typed.current || prev === value || document.activeElement !== el) return;
    // 다른 사람이 고친 글: 고친 곳보다 뒤에 있던 커서는 늘어나거나 줄어든 만큼 옮김
    const d = diffRegion(prev, value);
    const delta = d.text.length - (d.end - d.start);
    const move = (p: number) => (p <= d.start ? p : p >= d.end ? p + delta : d.start + d.text.length);
    const [a, b] = sel.current;
    el.setSelectionRange(move(a), move(b));
    sel.current = [move(a), move(b)];
    typed.current = value;
  }, [value]);

  const remember = () => {
    const el = ref.current;
    if (el) sel.current = [el.selectionStart, el.selectionEnd];
  };

  return (
    <div className={`relative ${className}`}>
      <textarea
        ref={ref}
        value={value}
        rows={minRows}
        placeholder={ph}
        spellCheck={false}
        onChange={(e) => {
          typed.current = e.target.value;
          remember();
          set(k, single ? e.target.value.replace(/\n/g, " ") : e.target.value);
          // 조합 끝 알림이 빠지는 브라우저도 있어, 조합이 아닌 입력이 오면 조합이 끝난 것으로 봄 (미뤄 둔 글은 방금 입력한 글 위에 합침)
          if (!(e.nativeEvent as InputEvent).isComposing) compose(k, false);
        }}
        onSelect={remember}
        onKeyDown={single ? (e) => e.key === "Enter" && e.preventDefault() : undefined}
        onFocus={() => focus(k)}
        onBlur={() => {
          compose(k, false);
          blur(k);
        }}
        onCompositionStart={() => compose(k, true)}
        onCompositionEnd={() => compose(k, false)}
        className={`block w-full resize-none overflow-hidden rounded-[3px] bg-transparent px-1.5 py-1 text-[13px] leading-[1.55] text-slate-900 outline-none transition-[background-color,box-shadow] [field-sizing:content] placeholder:text-slate-300 hover:bg-slate-50 focus:bg-indigo-50/60 print:hidden ${center ? "text-center" : ""}`}
        style={others ? { boxShadow: `inset 0 0 0 2px ${others[0].color}` } : undefined}
      />
      {others && (
        <span className="pointer-events-none absolute -top-2 right-1 z-10 rounded px-1.5 py-px text-[10px] font-semibold leading-tight text-white shadow-sm print:hidden" style={{ background: others[0].color }}>
          {others.map((o) => o.name).join(", ")} 입력 중
        </span>
      )}
      <div className={`hidden min-h-[1.4em] whitespace-pre-wrap break-words px-1 py-0.5 text-[10pt] leading-snug print:block ${center ? "text-center" : ""}`}>{value}</div>
    </div>
  );
}

/** 글자가 아닌 값으로 보여 주기만 하는 칸 (인쇄에도 그대로) */
const V = ({ k, fallback = "" }: { k: string; fallback?: string }) => <>{useIep().values[k] || fallback}</>;

// ---------------------------------------------------------------- 표 부품

const page = "iep-page mx-auto w-full max-w-[210mm] bg-white p-[10mm] shadow-sm ring-1 ring-slate-200 print:max-w-none print:p-0 print:shadow-none print:ring-0";
const td = "border border-slate-800 p-0 align-top";
const th = "border border-slate-800 px-2 py-1.5 text-center align-middle text-[13px] font-bold text-slate-800 print:text-[10pt]";
const green = "bg-[#f1f5e6]";
const gray = "bg-slate-100";
const dark = "bg-[#d9d9d9]";

// ---------------------------------------------------------------- 1쪽: 표지

const TEAM: [string, string][] = [
  ["교 장", "team.principal"],
  ["교 감", "team.vice"],
  ["특수교사", "team.sp1"],
  ["특수교사", "team.sp2"],
  ["통합교사", "team.inc"],
  ["학 부 모", "team.parent"],
];

function CoverPage() {
  return (
    <section className={page}>
      <div className="flex items-end gap-1 pl-[12%] text-xl font-bold text-slate-900">
        <F k="year" single center className="w-20" ph="2026" />
        <span className="pb-1">학년도</span>
        <F k="semester" single center className="ml-2 w-10" ph="2" />
        <span className="pb-1">학기</span>
      </div>
      <h1 className="mt-10 text-center text-[44px] font-black tracking-tight text-slate-900 print:text-[38pt]">개별화교육계획</h1>
      <p className="mt-1 text-center text-2xl tracking-[0.12em] text-slate-800 print:text-[18pt]">Individualized Education Plan</p>

      <table className="mt-6 w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[12%]" />
          <col className="w-[16%]" />
          <col className="w-[13%]" />
          <col className="w-[24%]" />
          <col className="w-[15%]" />
          <col className="w-[20%]" />
        </colgroup>
        <tbody>
          <tr>
            <th className={`${th} ${green}`}>반</th>
            <td className={td}>
              <F k="unit" single center />
            </td>
            <th className={`${th} ${green}`}>학생명</th>
            <td className={td}>
              <F k="name" single center />
            </td>
            <th className={`${th} ${green}`}>생년월일</th>
            <td className={td}>
              <F k="birth" single center />
            </td>
          </tr>
          <tr>
            <th className={`${th} ${green} py-3`}>작성자</th>
            <td className={td} colSpan={2}>
              <F k="author" single center className="py-2" />
            </td>
            <th className={`${th} ${green}`}>실시기간</th>
            <td className={td} colSpan={2}>
              <F k="period" single center className="py-2" ph="예: 2026. 8. 18. ~ 2027. 2. 12." />
            </td>
          </tr>
          <tr>
            <th className={`${th} py-3 text-base`} colSpan={6}>
              개별화교육지원팀
            </th>
          </tr>
          <tr>
            <th className={`${th} ${green} py-3`} colSpan={2}>
              직 책
            </th>
            <th className={`${th} ${green}`} colSpan={2}>
              성 명
            </th>
            <th className={`${th} ${green}`} colSpan={2}>
              서 명 (인)
            </th>
          </tr>
          {TEAM.map(([label, key]) => (
            <tr key={key}>
              <th className={`${th} ${green} py-3`} colSpan={2}>
                {label}
              </th>
              <td className={`${td} align-middle`} colSpan={2}>
                <F k={key} single center />
              </td>
              <td className={td} colSpan={2} />
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-5 border border-slate-800 bg-[#fafaf5] px-3 py-3 text-[12.5px] leading-7 text-slate-800 print:text-[9.5pt]">
        <p className="font-bold">※평가지침</p>
        <p>4-독립적으로 과제를 수행하는 경우(80%), 3-교사의 언어적 촉진을 받아 수행하는 경우(60%),</p>
        <p>2-신체적 도움을 받아 수행하는 경우(40%), 1-과제 수행을 전혀 하지 못하는 경우(20%)이하</p>
        <p className="font-bold">로 나누어서 기록한다.</p>
      </div>

      <F k="school" single center className="mx-auto mt-12 max-w-xs [&_div]:text-[24pt] [&_div]:font-bold [&_div]:tracking-[0.3em] [&_textarea]:text-3xl [&_textarea]:font-bold [&_textarea]:tracking-[0.3em]" />
    </section>
  );
}

// ---------------------------------------------------------------- 2쪽: 인적 사항 · 교육활동계획 · 관련서비스

const PROFILE: [string, string, number][] = [
  ["1. 주소", "address", 1],
  ["2. 전화번호", "phone", 1],
  ["3. 생년월일", "birth", 1],
  ["4. 장애유형 및 등급", "disability", 1],
  ["5. 특수교육대상 선정년도", "selectedYear", 1],
  ["6. 건강상태", "health", 1],
  ["7. 병력 및 약물복용", "medical", 1],
  ["8. 행동특성", "behavior", 4],
  ["9. 학부모 요구", "parentNeeds", 2],
  ["10. 졸업 후 진로", "career", 1],
];
const SIGNERS = ["교 장", "교 감", "통합교사", "특수교사", "학부모"];

function ProfilePage() {
  return (
    <section className={`${page} break-before-page`}>
      <h2 className="mb-3 text-center text-xl text-slate-900 print:text-[15pt]">
        <V k="year" />
        학년도 <V k="semester" />
        학기 개별화 교육 계획
      </h2>
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[17%]" />
          <col className="w-[47%]" />
          <col className="w-[18%]" />
          <col className="w-[18%]" />
        </colgroup>
        <tbody>
          <tr>
            <th className={`${th} ${gray} border-2`}>인 적 사 항</th>
            <td className={`${td} border-2 align-middle`}>
              <div className="flex items-center justify-center gap-0.5 text-[13px] font-semibold print:text-[10pt]">
                <F k="grade" single center className="w-9" />
                학년
                <F k="classNo" single center className="w-9" />반
                <F k="number" single center className="w-9" />번 이름 :
                <F k="name" single className="w-24" />
              </div>
            </td>
            <th className={`${th} ${gray} border-2`} colSpan={2}>
              개별화교육지원팀
            </th>
          </tr>
          <tr>
            <td className={`${td} border-2 px-1 py-1`} colSpan={2} rowSpan={SIGNERS.length}>
              {PROFILE.map(([label, key, rows]) => (
                <div key={key} className="flex items-start gap-1">
                  <span className="shrink-0 py-1 pl-0.5 text-[13px] font-bold text-slate-800 print:py-0.5 print:text-[10pt]">{label} :</span>
                  <F k={key} minRows={rows} className="min-w-0 flex-1" />
                </div>
              ))}
            </td>
            <th className={`${th} border-2 py-6`}>{SIGNERS[0]}</th>
            <td className={`${td} border-2`} />
          </tr>
          {SIGNERS.slice(1).map((s) => (
            <tr key={s}>
              <th className={`${th} border-2 py-6`}>{s}</th>
              <td className={`${td} border-2`} />
            </tr>
          ))}
        </tbody>
      </table>

      {/* 교육활동계획 */}
      <table className="mt-2 w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col className="w-[13%]" />
          <col className="w-[8%]" />
          <col className="w-[20%]" />
          <col className="w-[33%]" />
          <col className="w-[26%]" />
        </colgroup>
        <tbody>
          <tr>
            <th className={`${th} ${gray} text-left`} colSpan={5}>
              교육활동계획
            </th>
          </tr>
          <tr>
            {["배치형태", "구분", "실시기간", "교과", "담당교사"].map((h) => (
              <th key={h} className={`${th} font-medium`}>
                {h}
              </th>
            ))}
          </tr>
          {[
            ["통합\n학급", "inc"],
            ["특수\n학급", "sp"],
          ].map(([label, key], i) => (
            <tr key={key}>
              {i === 0 && (
                <td className={`${td} align-middle`} rowSpan={2}>
                  <F k="plan.placement" center />
                </td>
              )}
              <th className={`${th} whitespace-pre-line font-medium`}>{label}</th>
              <td className={td}>
                <F k={`plan.${key}.period`} center />
              </td>
              <td className={td}>
                <F k={`plan.${key}.subject`} center />
              </td>
              <td className={td}>
                <F k={`plan.${key}.teacher`} center />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 재량(외부)활동 및 방과후 학교 */}
      <table className="mt-2 w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[9%]" />
          <col className="w-[11%]" />
          <col className="w-[20%]" />
          <col className="w-[29%]" />
          <col className="w-[31%]" />
        </colgroup>
        <tbody>
          <tr>
            <th className={`${th} ${gray} text-left`} colSpan={5}>
              재량(외부)활동 및 방과후 학교
            </th>
          </tr>
          <tr>
            <th className={`${th} font-medium`} colSpan={2}>
              영역
            </th>
            {["담당자", "기간", "비고"].map((h) => (
              <th key={h} className={`${th} font-medium`}>
                {h}
              </th>
            ))}
          </tr>
          {[
            ["방과후 학교", "act.after"],
            ["현장체험학습", "act.field"],
          ].map(([label, key]) => (
            <tr key={key}>
              <th className={`${th} py-3 font-medium`} colSpan={2}>
                {label}
              </th>
              <td className={td}>
                <F k={`${key}.who`} center />
              </td>
              <td className={td}>
                <F k={`${key}.period`} center />
              </td>
              <td className={td}>
                <F k={`${key}.note`} />
              </td>
            </tr>
          ))}
          <tr>
            <th className={`${th} font-medium`} rowSpan={3}>
              교과
              <br />
              연계
            </th>
            <th className={`${th} font-medium`} rowSpan={2}>
              성·
              <br />
              인권교육
            </th>
            <td className={td} rowSpan={2}>
              <F k="act.sex.who" center />
            </td>
            <td className={td} rowSpan={2}>
              <F k="act.sex.period" center />
            </td>
            <td className={td}>
              <F k="act.sex.note" />
            </td>
          </tr>
          <tr>
            <td className={td}>
              <F k="act.sex.note2" />
            </td>
          </tr>
          <tr>
            <th className={`${th} font-medium`}>안전교육</th>
            <td className={td}>
              <F k="act.safety.who" center />
            </td>
            <td className={td}>
              <F k="act.safety.period" center />
            </td>
            <td className={td}>
              <F k="act.safety.note" />
            </td>
          </tr>
        </tbody>
      </table>

      {/* 특수교육 관련서비스 및 평가조정 */}
      <table className="mt-2 w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[17%]" />
          <col className="w-[18%]" />
          <col className="w-[18%]" />
          <col className="w-[14%]" />
          <col className="w-[33%]" />
        </colgroup>
        <tbody>
          <tr>
            <th className={`${th} ${gray} text-left`} colSpan={5}>
              특수교육 관련서비스 및 평가조정
            </th>
          </tr>
          <tr>
            {["치료지원 영역", "치료지원 방법", "통학비 지원", "지원인력", "평가조정"].map((h) => (
              <th key={h} className={`${th} font-medium`}>
                {h}
              </th>
            ))}
          </tr>
          <tr>
            {["svc.therapyArea", "svc.therapyMethod", "svc.transport", "svc.staff", "svc.adjust"].map((k) => (
              <td key={k} className={td}>
                <F k={k} center minRows={2} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------- 교과 · 생활 영역 공통

/** 영역 머리의 편집 단추 (인쇄할 때는 숨김) */
function SectionTools({ id, label, onRemove }: { id: string; label: string; onRemove: () => void }) {
  const { values, set } = useIep();
  const [confirm, setConfirm] = useState(false);
  const rows = Math.min(MAX_ROWS, Math.max(1, Number(values[sk(id, "rows")]) || DEFAULT_ROWS));
  const removeRow = () => {
    set(sk(id, `r${rows - 1}.t`), "");
    set(sk(id, `r${rows - 1}.sc`), "");
    set(sk(id, "rows"), String(rows - 1));
  };
  return (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5 print:hidden">
      <span className="mr-auto text-xs font-semibold text-slate-400">{label}</span>
      <button type="button" disabled={rows >= MAX_ROWS} onClick={() => set(sk(id, "rows"), String(rows + 1))} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 disabled:opacity-40">
        + 목표 줄 더하기
      </button>
      <button type="button" disabled={rows <= 1} onClick={removeRow} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 disabled:opacity-40">
        − 마지막 줄 빼기
      </button>
      <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50">
        <TrashIcon className="h-3.5 w-3.5" />
        영역 지우기
      </button>
      {confirm && (
        <ConfirmDialog
          title="이 영역을 지울까요?"
          confirmLabel="지우기"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            onRemove();
          }}
        >
          「{label}」 영역의 내용이 함께 편집하는 선생님 화면에서도 사라져요.
        </ConfirmDialog>
      )}
    </div>
  );
}

/** 단기목표(성취기준) 줄들과 1~4 성취평가 */
function GoalRows({ id }: { id: string }) {
  const { values, set } = useIep();
  const rows = Math.min(MAX_ROWS, Math.max(1, Number(values[sk(id, "rows")]) || DEFAULT_ROWS));
  return (
    <>
      {Array.from({ length: rows }, (_, i) => {
        const scoreKey = sk(id, `r${i}.sc`);
        const score = values[scoreKey] ?? "";
        return (
          <tr key={i} className="break-inside-avoid">
            <td className="border-y border-dashed border-slate-400 p-0 align-top">
              <F k={sk(id, `r${i}.t`)} />
            </td>
            {["1", "2", "3", "4"].map((n) => (
              <td key={n} className="border border-y-0 border-slate-800 border-b-slate-400 p-0 align-middle [border-bottom-style:dashed]">
                <button
                  type="button"
                  aria-pressed={score === n}
                  aria-label={`${i + 1}번째 목표 성취평가 ${n}점`}
                  onClick={() => set(scoreKey, score === n ? "" : n)}
                  className="grid h-full min-h-7 w-full place-items-center text-[13px] font-bold text-indigo-700 transition hover:bg-indigo-50 print:text-slate-900"
                >
                  {score === n ? "○" : ""}
                </button>
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}

const scoreCols = (
  <>
    <col />
    <col className="w-[4%]" />
    <col className="w-[4%]" />
    <col className="w-[4%]" />
    <col className="w-[4%]" />
  </>
);

// ---------------------------------------------------------------- 교과 영역 (3~5쪽)

function SubjectSection({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { values } = useIep();
  const subject = values[sk(id, "subject")] || "교과";
  const months = monthsFor(values.semester ?? "2");
  return (
    <>
      <section className={`${page} break-before-page`}>
        <SectionTools id={id} label={`${subject} 영역`} onRemove={onRemove} />
        <table className="w-full table-fixed border-collapse border-2 border-slate-800">
          <colgroup>
            <col className="w-[11%]" />
            {scoreCols}
          </colgroup>
          <tbody>
            <tr>
              <td className={`${td} ${dark}`} colSpan={2}>
                <div className="flex items-center gap-0.5 px-1 py-1 text-[13px] font-bold print:text-[10pt]">
                  <F k={sk(id, "subject")} single className="w-20" ph="교과" />
                  <span>-</span>
                  <F k={sk(id, "title")} single className="flex-1" ph="단원 · 영역" />
                </div>
              </td>
              <td className={`${td} ${dark}`} colSpan={4}>
                <p className="px-2 pt-1 text-[12px] font-bold print:text-[9pt]">▪ 교육의 시작 및 종료시기</p>
                <F k={sk(id, "term")} single center />
              </td>
            </tr>
            <tr>
              <th className={`${th} ${dark} border-r-4 border-double`}>
                현재학습
                <br />
                수행수준
              </th>
              <td className={td} colSpan={5}>
                <F k={sk(id, "present")} minRows={7} />
              </td>
            </tr>
            <tr>
              <th className={`${th} ${dark} border-r-4 border-double`}>장기목표</th>
              <td className={td} colSpan={5}>
                <F k={sk(id, "long")} minRows={7} />
              </td>
            </tr>
            <tr className="border-t-4 border-double border-slate-800">
              <th className={`${th} ${dark} border-r-4 border-double`} rowSpan={2 + (Number(values[sk(id, "rows")]) || DEFAULT_ROWS)}>
                단기목표
              </th>
              <th className={`${th} tracking-[0.3em]`} rowSpan={2}>
                성 취 기 준
              </th>
              <th className={`${th} py-0.5 text-[12px]`} colSpan={4}>
                성취평가
              </th>
            </tr>
            <tr>
              {[1, 2, 3, 4].map((n) => (
                <th key={n} className={`${th} px-0 py-0.5 text-[12px]`}>
                  {n}
                </th>
              ))}
            </tr>
            <GoalRows id={id} />
            <tr className="break-inside-avoid">
              <th className={`${th} ${dark} border-r-4 border-double`} rowSpan={2}>
                교육방법
              </th>
              <td className={`${td} px-2 py-1 text-[11.5px] leading-snug text-slate-700 print:text-[8.5pt]`} colSpan={5}>
                <p>※ 성취평가 작성준거</p>
                <p className="font-bold">4점- 독립적으로 과제를 수행하는 경우(80%)</p>
                <p className="font-bold">3점-교사의 언어적 촉진을 받아 수행하는 경우(60%),</p>
                <p className="font-bold">2점-신체적 도움을 받아 수행하는 경우(40%)</p>
                <p className="font-bold">1점-과제 수행을 전혀 하지 못하는 경우(20%)이하</p>
              </td>
            </tr>
            <tr className="break-inside-avoid">
              <td className={`${td} px-1 py-0.5`} colSpan={5}>
                <Labeled label="교수·학습방법 :" k={sk(id, "method")} />
                <Labeled label="교수매체 :" k={sk(id, "media")} />
              </td>
            </tr>
            <tr className="break-inside-avoid">
              <th className={`${th} ${dark} border-r-4 border-double py-3`}>평가계획</th>
              <td className={td} colSpan={5}>
                <F k={sk(id, "evalPlan")} minRows={2} />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 학기 월별 학습 내용 및 평가 */}
      <section className={`${page} break-before-page`}>
        <p className="mb-2 text-xs font-semibold text-slate-400 print:hidden">{subject} 영역 · 월별 학습 내용</p>
        <table className="w-full table-fixed border-collapse border-2 border-slate-800">
          <colgroup>
            <col className="w-[6%]" />
            <col className="w-[12%]" />
            <col />
            <col className="w-[13%]" />
          </colgroup>
          <tbody>
            <tr>
              <th className={`${th} ${dark}`} colSpan={4}>
                학기 월별 학습 내용 및 평가
              </th>
            </tr>
            <tr>
              <th className={th}>월</th>
              <th className={`${th} tracking-[0.3em]`}>영역</th>
              <th className={`${th} tracking-[0.3em]`}>학습내용</th>
              <th className={`${th} tracking-[0.3em]`}>평가</th>
            </tr>
            {Array.from({ length: MONTH_ROWS }, (_, j) => (
              <tr key={j} className="break-inside-avoid">
                <th className={`${th} px-0 font-semibold`}>{months[j]}</th>
                <td className={td}>
                  <F k={sk(id, `m${j}.area`)} minRows={10} center />
                </td>
                <td className={td}>
                  <F k={sk(id, `m${j}.content`)} minRows={10} />
                </td>
                <td className={td}>
                  <F k={sk(id, `m${j}.eval`)} minRows={10} center />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Labeled({ label, k }: { label: string; k: string }) {
  return (
    <div className="flex items-start">
      <span className="shrink-0 py-1 pl-1 text-[13px] text-slate-800 print:py-0.5 print:text-[10pt]">{label}</span>
      <F k={k} className="min-w-0 flex-1" />
    </div>
  );
}

// ---------------------------------------------------------------- 일상생활적응 및 사회적 기술훈련 (6쪽)

function LifeSection({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { values } = useIep();
  const rows = Number(values[sk(id, "rows")]) || DEFAULT_ROWS;
  return (
    <section className={`${page} break-before-page`}>
      <SectionTools id={id} label="일상생활적응 및 사회적 기술훈련 영역" onRemove={onRemove} />
      <table className="w-full table-fixed border-collapse border-2 border-slate-800">
        <colgroup>
          <col className="w-[13%]" />
          {scoreCols}
        </colgroup>
        <tbody>
          <tr>
            <td className={`${td} ${gray} px-2 py-2 align-middle text-[13px] font-bold print:text-[10pt]`} colSpan={2}>
              일상생활적응 및 사회적 기술훈련(진로교육 포함)
            </td>
            <td className={`${td} ${gray}`} colSpan={4}>
              <p className="px-2 pt-1 text-[12px] font-bold print:text-[9pt]">▪ 교육의 시작 및 종료시기</p>
              <F k={sk(id, "term")} single center />
            </td>
          </tr>
          <tr>
            <th className={`${th} border-r-4 border-double`}>현재수준</th>
            <td className={td} colSpan={5}>
              <F k={sk(id, "present")} minRows={3} />
            </td>
          </tr>
          <tr>
            <th className={`${th} border-r-4 border-double`}>장기목표</th>
            <td className={td} colSpan={5}>
              <F k={sk(id, "long")} minRows={10} />
            </td>
          </tr>
          <tr className="border-t-4 border-double border-slate-800">
            <th className={`${th} border-r-4 border-double`} rowSpan={3 + rows}>
              단기목표
            </th>
            <th className={`${th} tracking-[0.3em]`} rowSpan={2}>
              성 취 기 준
            </th>
            <th className={`${th} py-0.5 text-[12px]`} colSpan={4}>
              성취평가
            </th>
          </tr>
          <tr>
            {[1, 2, 3, 4].map((n) => (
              <th key={n} className={`${th} px-0 py-0.5 text-[12px]`}>
                {n}
              </th>
            ))}
          </tr>
          <GoalRows id={id} />
          <tr className="break-inside-avoid">
            <td className={`${td} px-2 py-1 text-[11.5px] leading-6 text-slate-700 print:text-[8.5pt]`} colSpan={5}>
              <p>※ 성취평가 작성준거</p>
              <p className="grid grid-cols-2 pl-2">
                <span>1. 하기 어려움</span>
                <span>2. 신체적 보조를 필요로 함(전반적 도움)</span>
                <span>3. 언어적 지시를 필요로 함(부분적 도움)</span>
                <span>4. 수행할 수 있음(잘함)</span>
              </p>
            </td>
          </tr>
          <tr className="break-inside-avoid border-t-4 border-double border-slate-800">
            <th className={`${th} border-r-4 border-double`}>교육방법</th>
            <td className={`${td} px-1 py-0.5`} colSpan={5}>
              <Labeled label="교수·학습방법 :" k={sk(id, "method")} />
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
