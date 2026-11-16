"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  currentTerm,
  DEFAULT_ROWS,
  DOC_KEYS,
  metaFromFields,
  studentIds,
  studentKey,
  withTerm,
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
import { ArrowLeftIcon, DownloadIcon, PlusIcon, Spinner, TrashIcon, XIcon } from "./icons";
import { fmtDate, FORM_V2, goalIdsOf, structureKey, studentFieldsV2, SUBJECTS_V2, type StudentInput } from "@/lib/iepV2";
import { IEP_STATUS_TEXT, useIepSync, type Me } from "./useIepSync";
import { useStepFlow } from "./StepFlow";

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

  /** 계획에 들어갈 때마다 이름을 묻고(지난번 이름을 미리 채움) 나서 then 을 함 */
  const withName = (then: () => void) => setAskName(() => then);

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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">개별화교육계획 작성하기</h1>
      </div>
      <IepList
        docs={docs}
        state={state}
        myName={myName}
        onOpen={(id) => withName(() => setOpenId(id))}
        onCreated={(meta) => {
          setDocs((d) => [meta, ...(d ?? [])]);
        }}
        onDeleted={(id) => setDocs((d) => (d ?? []).filter((x) => x.id !== id))}
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
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 print:hidden" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="fade-up w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold text-slate-900">이름을 적고 들어가 주세요</h2>
        <p className="mt-1 text-sm text-slate-500">함께 편집하는 다른 선생님 화면에 이 이름으로 보여요.</p>
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
            들어가기
          </button>
        </div>
      </form>
    </div>,
    document.body,
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
  onRetry,
}: {
  docs: IepMeta[] | null;
  state: "loading" | "ok" | "auth" | "fail";
  myName: string;
  onOpen: (id: string) => void;
  onCreated: (meta: IepMeta) => void;
  onDeleted: (id: string) => void;
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
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700"
        >
          <PlusIcon className="h-4 w-4" />개별화교육계획 만들기
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
          <p className="rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-500">아직 작성한 계획이 없어요. 「개별화교육계획 만들기」를 눌러 시작해 보세요.</p>
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

/** 개별화교육계획 만들기: 학년도와 학기만 정함 (학교 한글 양식의 학생 칸을 그대로 고침) */
function NewDocDialog({ by, onCancel, onCreated }: { by: string; onCancel: () => void; onCreated: (m: IepMeta) => void }) {
  const term = currentTerm();
  const [year, setYear] = useState(term.year);
  const [semester, setSemester] = useState(term.semester);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!/^\d{4}$/.test(year)) return setError("학년도를 네 자리 숫자로 적어 주세요.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/iep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, semester, students: [], by }),
      });
      const data = (await res.json().catch(() => null)) as { doc?: IepMeta; error?: string } | null;
      if (!res.ok || !data?.doc) throw new Error(data?.error ?? "만들지 못했어요.");
      onCreated(data.doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "만들지 못했어요.");
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className="fade-up w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold text-slate-900">개별화교육계획 만들기</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">학년도</span>
            <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoFocus className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">학기</span>
            <select value={semester} onChange={(e) => setSemester(e.target.value)} className={inputCls}>
              <option value="1">1학기</option>
              <option value="2">2학기</option>
            </select>
          </label>
        </div>
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
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- 편집 화면

/** 이 학생의 칸 이름을 만드는 함수 (교과 · 생활 영역 칸과 문서 전체 칸은 그대로) */
const keyFor = (sid: string) => (k: string) => (k.startsWith("s.") || DOC_KEYS.has(k) ? k : studentKey(sid, k));

type Ctx = {
  values: Record<string, string>;
  set: (key: string, value: string) => void;
  focus: (key: string) => void;
  blur: (key: string) => void;
  compose: (key: string, on: boolean) => void;
  /** 칸 → 그 칸을 입력 중인 다른 선생님들 */
  who: Record<string, IepPresence[]>;
  /** 화면의 칸 이름 → 저장 칸 이름 (학생마다 따로인 칸은 "st.<학생 id>." 를 붙임) */
  key: (k: string) => string;
};
const IepCtx = createContext<Ctx | null>(null);
const useIep = () => useContext(IepCtx)!;

function IepEditor({ docId, myName, onBack, onRename, nameDialog }: { docId: string; myName: string; onBack: () => void; onRename: () => void; nameDialog: ReactNode }) {
  const [clientId] = useState(() => `c${Math.random().toString(36).slice(2, 10)}`);
  const me = useMemo<Me>(() => ({ id: clientId, name: myName, color: colorFor(myName) }), [clientId, myName]);
  const sync = useIepSync(docId, me);
  const { values, presence, status, detail, loaded, set: rawSet, focus, blur, compose, moveCursor } = sync;
  const docRef = useRef<HTMLDivElement>(null);

  // ---- 되돌리기(Ctrl+Z) · 다시 하기(Ctrl+Y): 내가 고친 칸의 값을 차례로 되돌림 (한글 편집기처럼)
  type Change = { key: string; before: string; after: string };
  type Entry = { changes: Change[]; at: number };
  const hist = useRef<{ undo: Entry[]; redo: Entry[]; shadow: Record<string, string> }>({ undo: [], redo: [], shadow: {} });
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
    hist.current.shadow = {};
  }, [values]);
  /** 칸을 고치면서 되돌릴 기록을 남김: 같은 칸을 이어서 적는 글은 한 번에, 한 동작에서 여러 칸을 바꾸면 한 묶음으로 */
  const set = useCallback(
    (key: string, value: string) => {
      const h = hist.current;
      const before = key in h.shadow ? h.shadow[key] : (valuesRef.current[key] ?? "");
      if (before === value) return;
      h.shadow[key] = value;
      const now = Date.now();
      const last = h.undo[h.undo.length - 1];
      if (last && now - last.at < 40) {
        const same = last.changes.find((c) => c.key === key);
        if (same) same.after = value;
        else last.changes.push({ key, before, after: value });
        last.at = now;
      } else if (last && last.changes.length === 1 && last.changes[0].key === key && now - last.at < 1200) {
        last.changes[0].after = value;
        last.at = now;
      } else {
        h.undo.push({ changes: [{ key, before, after: value }], at: now });
        if (h.undo.length > 300) h.undo.shift();
      }
      h.redo = [];
      rawSet(key, value);
    },
    [rawSet],
  );
  const undo = useCallback(() => {
    const e = hist.current.undo.pop();
    if (!e) return;
    for (const c of [...e.changes].reverse()) rawSet(c.key, c.before);
    hist.current.redo.push(e);
  }, [rawSet]);
  const redo = useCallback(() => {
    const e = hist.current.redo.pop();
    if (!e) return;
    for (const c of e.changes) rawSet(c.key, c.after);
    e.at = 0; // 다시 한 뒤 이어 적는 글이 이 묶음에 합쳐지지 않게
    hist.current.undo.push(e);
  }, [rawSet]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      // 문서 칸이 아닌 입력창(이름 · 주소 등)에서는 그 입력창의 되돌리기를 그대로 둠
      const t = e.target;
      if ((t instanceof HTMLInputElement || t instanceof HTMLSelectElement || (t instanceof HTMLTextAreaElement && !t.dataset.field)) && !(t instanceof HTMLInputElement && t.type === "checkbox")) return;
      e.preventDefault();
      if (k === "y" || e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);
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
  // 학생: 한 학년도 · 학기 문서에 여러 명. 위쪽 학생 단추로 골라 한 명씩 고침 (예전 학생 한 명짜리 문서는 학생 id 가 빈 글자)
  const ids = useMemo(() => studentIds(values), [values]);
  const legacy = !("studentList" in values);
  const [picked, setPicked] = useState("");
  const current = ids.includes(picked) ? picked : (ids[0] ?? "");
  /** 학교 한글 양식을 그대로 고치는 문서 (새로 만드는 문서는 모두 이것) */
  const isForm = !!values.form;
  const key = useMemo(() => (isForm ? (k: string) => k : keyFor(current)), [isForm, current]);
  const ctx = useMemo<Ctx>(() => ({ values, set, focus, blur, compose, who, key }), [values, set, focus, blur, compose, who, key]);
  const [removingStudent, setRemovingStudent] = useState(false);

  const sections = parseList(values[key("sectionList")]);
  const title = docTitle(metaFromFields(values));
  const studentLabel = (sid: string) => {
    const v = (k: string) => values[studentKey(sid, k)] ?? "";
    return `${v("grade") && v("classNo") ? `${v("grade")}-${v("classNo")} ` : ""}${v("name") || "이름 없음"}`;
  };
  const removeStudent = () => {
    set("studentList", JSON.stringify(ids.filter((x) => x !== current)));
    setPicked("");
  };

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
    set(key("sectionList"), JSON.stringify([...sections, id]));
  };
  const removeSection = (id: string) => set(key("sectionList"), JSON.stringify(sections.filter((s) => s !== id)));

  const people = [{ id: me.id, name: myName, color: me.color, field: "" }, ...presence];
  /** 따라가는 선생님 (프로필을 누르면 그 선생님이 고치는 곳을 구글 문서처럼 따라감) */
  const [following, setFollowing] = useState<string | null>(null);
  const followed = following ? (presence.find((p) => p.id === following) ?? null) : null;
  /** 개별화교육계획(학교 양식) 화면에서 고른 학생 */
  const [v2Sid, setV2Sid] = useState<string | null>(null);
  const followField = followed?.field ?? "";
  /** 따라가기 멈추기: 멈춘 뒤에도 따라가던 학생 화면에 그대로 머묾 */
  const stopFollow = () => {
    const s = followField ? sidOfField(values, followField) : null;
    if (s) setV2Sid(s);
    setFollowing(null);
  };
  // 내가 화면을 움직이거나 글을 적으면 따라가기를 멈춤 (구글 문서처럼)
  useEffect(() => {
    if (!following) return;
    const stop = (e: Event) => {
      if (e.target instanceof Element && e.target.closest("[data-follow-ui]")) return;
      const s = followField ? sidOfField(values, followField) : null;
      if (s) setV2Sid(s);
      setFollowing(null);
    };
    const opts = { passive: true } as const;
    window.addEventListener("wheel", stop, opts);
    window.addEventListener("touchmove", stop, opts);
    window.addEventListener("keydown", stop);
    window.addEventListener("mousedown", stop);
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("mousedown", stop);
    };
  }, [following, followField, values]);
  // 따라가는 선생님이 칸을 고치지 않을 때는 그 선생님의 마우스 높이로 화면을 옮김
  const followY = followed && !followed.field && followed.cursor ? Math.round(followed.cursor[1] / 40) * 40 : null;
  useEffect(() => {
    if (followY === null || !docRef.current) return;
    const top = docRef.current.getBoundingClientRect().top + window.scrollY + followY;
    window.scrollTo({ top: Math.max(0, top - window.innerHeight / 2), behavior: "smooth" });
  }, [followY]);

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
            <div className="flex items-center" data-follow-ui>
              {people.map((p, i) => {
                const on = i > 0 && p.id === following;
                return (
                  <button
                    key={p.id}
                    type="button"
                    title={i === 0 ? `나 (${p.name}) · 누르면 이름 바꾸기` : on ? `${p.name} 선생님 따라가기 멈추기` : `${p.name} 선생님 따라가기 (그 선생님이 고치는 곳을 따라가요)`}
                    aria-pressed={i === 0 ? undefined : on}
                    onClick={i === 0 ? onRename : () => (on ? stopFollow() : setFollowing(p.id))}
                    className={`-ml-1.5 grid h-8 w-8 cursor-pointer place-items-center rounded-full text-xs font-bold text-white ring-2 first:ml-0 ${on ? "relative z-10 ring-offset-2" : "ring-white"}`}
                    style={{ background: p.color, ...(on ? ({ "--tw-ring-color": p.color } as CSSProperties) : {}) }}
                  >
                    {[...p.name][0]}
                  </button>
                );
              })}
              {presence.length > 0 && <span className="ml-2 hidden text-xs font-medium text-slate-500 sm:inline">{presence.length + 1}명이 함께 편집 중</span>}
            </div>
            <a
              href={`/api/iep/hwp?id=${docId}`}
              download
              aria-disabled={!loaded}
              title="학생 모두를 학교 양식 그대로 한글 파일 하나로 내려받아요"
              className={`inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 ${loaded ? "" : "pointer-events-none opacity-40"}`}
            >
              <DownloadIcon className="h-4 w-4" />
              한글(HWP) 내려받기
            </a>
          </div>
          {/* 학생 고르기 (학년도 · 학기 문서 하나에 여러 학생) */}
          {loaded && !legacy && !isForm && (
            <div className="mx-auto mt-3 flex max-w-[210mm] flex-wrap items-center gap-1.5">
              {ids.map((sid) => (
                <button
                  key={sid}
                  type="button"
                  aria-pressed={sid === current}
                  onClick={() => setPicked(sid)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${sid === current ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
                >
                  {studentLabel(sid)}
                  {presence.some((p) => p.field.startsWith(`st.${sid}.`)) && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" title="다른 선생님이 고치는 중" />}
                </button>
              ))}
              {ids.length > 0 && (
                <button type="button" onClick={() => setRemovingStudent(true)} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                  <TrashIcon className="h-3.5 w-3.5" />이 학생 빼기
                </button>
              )}
            </div>
          )}
        </div>
        {removingStudent && (
          <ConfirmDialog
            title={`${studentLabel(current)} 학생을 뺄까요?`}
            confirmLabel="빼기"
            onCancel={() => setRemovingStudent(false)}
            onConfirm={() => {
              setRemovingStudent(false);
              removeStudent();
            }}
          >
            이 학생의 계획이 함께 편집하는 선생님 화면에서도 사라지고, 한글 파일에도 들어가지 않아요.
          </ConfirmDialog>
        )}

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
                    {/* 끝이 뾰족한 세모 화살표 (선생님마다 색이 다름) */}
                    <svg width="22" height="22" viewBox="0 0 22 22" className="drop-shadow">
                      <path d="M2.5 2.5 L19.5 11.5 L11.5 12.8 L5.5 19.5 Z" fill={p.color} stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
                    </svg>
                    <span className="ml-3 -mt-1 block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white shadow" style={{ background: p.color }}>
                      {p.name}
                    </span>
                  </div>
                ),
            )}
            {/* 따라가는 중 알림 */}
            {followed &&
              createPortal(
                <>
                  {/* 구글 문서처럼 화면 가장자리를 그 선생님 색으로 */}
                  <div aria-hidden className="pointer-events-none fixed inset-0 z-50 print:hidden" style={{ boxShadow: `inset 0 0 0 3px ${followed.color}` }} />
                  <div data-follow-ui className="fixed left-1/2 top-[76px] z-50 flex -translate-x-1/2 items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-sm font-semibold text-white shadow-lg print:hidden" style={{ background: followed.color }}>
                    {followed.name} 선생님을 따라가는 중
                    <button type="button" onClick={stopFollow} className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs hover:bg-white/30">
                      멈추기
                    </button>
                  </div>
                </>,
                document.body,
              )}
            {values.form === FORM_V2 ? (
              <DocV2 sid={v2Sid} onSid={setV2Sid} follow={followed?.field ? { field: followed.field } : null} />
            ) : isForm ? (
              <FormDoc year={values.year ?? ""} semester={values.semester ?? ""} />
            ) : !legacy && !ids.length ? (
              <p className="mx-auto max-w-md rounded-xl bg-white p-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
                아직 학생이 없어요.
              </p>
            ) : (
              <>
            <CoverPage />
            <ProfilePage />
            {sections.map((id) =>
              values[sk(id, "kind")] === "life" ? (
                <LifeSection key={id} id={id} onRemove={() => removeSection(id)} />
              ) : (
                <SubjectSection key={id} id={id} onRemove={() => removeSection(id)} />
              ),
            )}
              </>
            )}
            <div className={`mx-auto flex max-w-[210mm] flex-wrap justify-center gap-2 print:hidden ${isForm || (!legacy && !ids.length) ? "hidden" : ""}`}>
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

// ---------------------------------------------------------------- 학교 한글 양식을 그대로 고치는 화면

type FormStyle = { align: "left" | "center" | "right" | "justify"; bold: boolean; size: number; font?: string; fontName?: string; spacing?: number; color?: string; ls?: number };
type FormCellT = FormStyle & {
  key: string;
  r: number;
  c: number;
  rs: number;
  cs: number;
  w: number;
  h: number;
  bg: string | null;
  border?: [string, string, string, string];
  valign: "top" | "middle" | "bottom";
  text: string;
  locked: boolean;
  lines?: string[];
  /** 칸 안 문단마다의 모양 */
  styles?: FormStyle[];
};
type FormBlockT = { pi?: number; page?: boolean } & (
  | (FormStyle & { type: "p"; key: string; text: string; locked: boolean })
  | { type: "table"; key: string; w: number; rows: number; cols: number; split?: boolean; cells: FormCellT[] }
  | { type: "object"; w?: number; h?: number; align?: FormStyle["align"]; image?: boolean }
);
type FormT = { sections: { label: string; nameKey?: string; blocks: FormBlockT[] }[] };

/** 한글 글자 크기(pt) → 화면 px (한글 파일과 같은 크기) */
const fontPx = (pt: number) => `${Math.round(Math.max(pt || 10, 5) * 13.33) / 10}px`;
/** 한글 글자 모양 → 화면 글자 모양 (글꼴 · 크기 · 굵기 · 자간 · 색 · 정렬) */
const cellStyle = (s: FormStyle): CSSProperties => ({
  fontSize: fontPx(s.size),
  fontWeight: s.bold ? 700 : 400,
  fontFamily: s.font,
  letterSpacing: s.spacing ? `${s.spacing / 100}em` : undefined,
  color: s.color && s.color !== "#000000" ? s.color : undefined,
  textAlign: s.align === "justify" ? "left" : s.align,
  // 한글의 줄 간격(글자 크기에 대한 %)을 그대로
  lineHeight: s.ls ? s.ls / 100 : 1.45,
});
/** 칸 테두리 (한글 파일의 칸마다의 선 종류 · 굵기 그대로) */
const borderStyle = (c: FormCellT): CSSProperties =>
  c.border ? { borderLeft: c.border[0], borderRight: c.border[1], borderTop: c.border[2], borderBottom: c.border[3] } : { border: "1px solid #334155" };

/** 표의 열 너비: 한 칸짜리 칸의 너비로 정하고, 합친 칸만 있는 열은 남는 너비를 나눔 */
function colWidths(t: Extract<FormBlockT, { type: "table" }>) {
  const w: (number | null)[] = Array(t.cols).fill(null);
  for (const c of t.cells) if (c.cs === 1 && c.c < t.cols) w[c.c] = Math.max(w[c.c] ?? 0, c.w);
  for (let pass = 0; pass < 3; pass++) {
    for (const c of [...t.cells].sort((a, b) => a.cs - b.cs)) {
      const span = w.slice(c.c, c.c + c.cs);
      const unknown = span.filter((x) => x === null).length;
      if (!unknown) continue;
      const known = span.reduce<number>((n, x) => n + (x ?? 0), 0);
      const each = Math.max(8, (c.w - known) / unknown);
      for (let i = c.c; i < c.c + c.cs && i < t.cols; i++) if (w[i] === null) w[i] = each;
    }
  }
  return w.map((x) => x ?? Math.max(8, t.w / t.cols));
}

/** 학교 한글 양식(빈 양식 파일)을 화면에 그대로 그리고, 모든 문단 · 칸을 바로 고침. 학생 칸은 위 단추로 골라 한 명씩 */
function FormDoc({ year, semester }: { year: string; semester: string }) {
  const { values, who } = useIep();
  const [form, setForm] = useState<FormT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/iep/form")
      .then(async (res) => {
        const data = (await res.json()) as FormT & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "양식을 불러오지 못했어요.");
        if (!cancelled) setForm(data);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "양식을 불러오지 못했어요."));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="mx-auto max-w-md rounded-xl bg-red-50 p-6 text-center text-sm text-red-700">{error}</p>;
  if (!form)
    return (
      <div className="grid place-items-center py-20">
        <Spinner className="h-8 w-8 text-indigo-600" />
      </div>
    );

  const term = (t: string) => withTerm(t, year, semester);
  const label = (i: number) => {
    const s = form.sections[i];
    return (s.nameKey && values[s.nameKey]?.trim()) || s.label;
  };
  const sec = form.sections[Math.min(section, form.sections.length - 1)];
  /** 이 학생 칸 안에서 다른 선생님이 고치고 있는지 */
  const busyIn = (i: number) =>
    form.sections[i].blocks.some((b) => (b.type === "p" ? !!who[b.key] : b.type === "table" ? b.cells.some((c) => !!who[c.key]) : false));

  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-[210mm] flex-wrap gap-1.5">
        {form.sections.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={i === section}
            onClick={() => setSection(i)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${i === section ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
          >
            {label(i)}
            {busyIn(i) && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" title="다른 선생님이 고치는 중" />}
          </button>
        ))}
      </div>

      {/* A4 한 쪽 너비(794px) 종이처럼. 좁은 화면에서는 옆으로 밀어서 봄 */}
      <div className="overflow-x-auto">
        <div className="mx-auto w-[794px] space-y-3 bg-white px-[56px] py-12 shadow-sm ring-1 ring-slate-200">
          {sec.blocks.map((b, i) => {
            if (b.type === "object") return null;
            if (b.type === "p") {
              if (!b.text && values[b.key] === undefined) return <div key={b.key} className="h-3" />;
              return <F key={b.key} k={b.key} fallback={term(b.text)} style={cellStyle(b)} className="w-full" />;
            }
            const widths = colWidths(b);
            const total = widths.reduce((n, x) => n + x, 0);
            const scale = Math.min(1, 682 / total); // 종이 안 너비(794 - 양쪽 여백)를 넘지 않게
            return (
              <table key={`${b.key}-${i}`} className="mx-auto table-fixed border-collapse" style={{ width: total * scale }}>
                <colgroup>
                  {widths.map((w, ci) => (
                    <col key={ci} style={{ width: w * scale }} />
                  ))}
                </colgroup>
                <tbody>
                  {Array.from({ length: b.rows }, (_, r) => (
                    <tr key={r}>
                      {b.cells
                        .filter((c) => c.r === r)
                        .sort((x, y) => x.c - y.c)
                        .map((c) => (
                          <td
                            key={c.key}
                            rowSpan={c.rs}
                            colSpan={c.cs}
                            className="p-0"
                            style={{ ...borderStyle(c), background: c.bg ?? undefined, verticalAlign: c.valign, height: Math.max(20, c.h * scale) }}
                          >
                            {c.locked ? (
                              <div className="whitespace-pre-wrap px-1.5 py-1 text-slate-500" style={cellStyle(c)}>
                                {c.text}
                              </div>
                            ) : (
                              <F k={c.key} fallback={term(c.text)} style={cellStyle(c)} />
                            )}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 개별화교육계획 (학교 한글 파일 형식 그대로)

type BindT = { field: string; para?: number } | { parts: { label: string; field: string }[] } | { choice: { field: string; value: string } };
type V2Cell = FormCellT & { bind?: BindT; goal?: { sec: string; gid: string } };
type V2Block = Exclude<FormBlockT, { type: "table" }> | (Extract<FormBlockT, { type: "table" }> & { cells: V2Cell[]; goalSec?: string; sizeId?: string; rowKeys?: string[] });
type V2Layout = {
  sections: { sid: string | null; label: string; blocks: V2Block[] }[];
  /** 쪽 크기 · 본문 둘레 여백 (px) */
  page?: { width: number; height: number; left: number; right: number; top: number; bottom: number };
  /** 고를 수 있는 글꼴 */
  fonts?: string[];
};

const wizInput = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";
const wizArea = "w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 단계별 입력 창 (화면 전체를 검게 덮음). 단계를 바꾸면 칭찬통장처럼 화면이 옆으로 밀려 바뀌고, 진행 막대가 왼쪽에서 오른쪽으로 채워짐 */
function Wizard({
  title,
  steps,
  step,
  onBack,
  onNext,
  onCancel,
  busy = false,
  hints = true,
  fadeClass = "",
  children,
}: {
  title: string;
  steps: string[];
  step: number;
  onBack: () => void;
  onNext: () => void;
  onCancel?: () => void;
  busy?: boolean;
  /** 단계마다의 설명 글을 제목 아래에 보여 줌 */
  hints?: boolean;
  /** 단계 화면이 밀려 바뀌는 움직임 (useStepFlow) */
  fadeClass?: string;
  children: ReactNode;
}) {
  const last = step === steps.length - 1;
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/70 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
        className="fade-up w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
      >
        <p className="text-xs font-semibold text-indigo-600">
          {step + 1} / {steps.length} 단계
        </p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">{title}</h2>
        {hints && <p className="mt-0.5 text-sm text-slate-500">{steps[step]}</p>}
        <div className="mt-2 flex gap-1" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
              {/* 지난 단계까지 왼쪽에서 오른쪽으로 채워짐 */}
              <span className="block h-full rounded-full bg-indigo-500 transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: i <= step ? "100%" : "0%" }} />
            </span>
          ))}
        </div>
        <div className="overflow-hidden">
          <div className={`mt-5 space-y-3 ${fadeClass}`}>{children}</div>
        </div>
        <div className="mt-6 flex gap-2">
          {step > 0 ? (
            <button type="button" onClick={onBack} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
              이전
            </button>
          ) : (
            onCancel && (
              <button type="button" onClick={onCancel} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
                취소
              </button>
            )
          )}
          <button type="submit" disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {busy && <Spinner className="h-4 w-4" />}
            {last ? "완료" : "다음"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

const Labeled2 = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
    {children}
  </label>
);

/** 처음 들어가면: 1단계 개별화 교육의 시작 · 종료 시기, 2단계 개별화교육지원팀(교장 · 교감 · 특수교사 두 분) */
function SetupWizard() {
  const { values, set } = useIep();
  const { step, goStep, fadeClass } = useStepFlow();
  const [start, setStart] = useState(values["term.start"] ?? "");
  const [end, setEnd] = useState(values["term.end"] ?? "");
  const [names, setNames] = useState({ principal: values["team.principal"] ?? "", vice: values["team.vice"] ?? "", sp1: values["team.sp1"] ?? "", sp2: values["team.sp2"] ?? "" });
  const [error, setError] = useState<string | null>(null);
  const next = () => {
    if (step === 0) {
      if (!start || !end) return setError("시작일과 종료일을 골라 주세요.");
      if (end < start) return setError("종료일이 시작일보다 빨라요.");
      setError(null);
      return goStep(1);
    }
    set("term.start", start);
    set("term.end", end);
    (Object.keys(names) as (keyof typeof names)[]).forEach((k) => set(`team.${k}`, names[k].trim()));
    set("setup", "1");
  };
  return (
    <Wizard title="개별화교육계획 처음 설정" steps={["개별화 교육의 시작 및 종료 시기를 알려 주세요.", "개별화교육지원팀 선생님 이름을 알려 주세요. 학생마다 기본값으로 들어가요."]} step={step} onBack={() => goStep(0)} onNext={next} fadeClass={fadeClass}>
      {step === 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <Labeled2 label="시작일">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={wizInput} autoFocus />
          </Labeled2>
          <Labeled2 label="종료일">
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={wizInput} />
          </Labeled2>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["principal", "교장"],
              ["vice", "교감"],
              ["sp1", "특수교사 1"],
              ["sp2", "특수교사 2"],
            ] as const
          ).map(([k, label], i) => (
            <Labeled2 key={k} label={label}>
              <input value={names[k]} onChange={(e) => setNames((n) => ({ ...n, [k]: e.target.value.slice(0, 20) }))} className={wizInput} autoFocus={i === 0} />
            </Labeled2>
          ))}
        </div>
      )}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </Wizard>
  );
}

const EMPTY_STUDENT: StudentInput = { name: "", grade: "1", cls: "", number: "", subjects: [], address: "", phone: "", birth: "", disability: "", selectedYear: "", health: "", medical: "", behavior: "", parentNeeds: "", career: "", parent: "", inc: "" };

/** 숫자만 받아 전화번호 모양으로 (010-1234-5678, 02-123-4567) */
function fmtPhone(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.startsWith("02")) return d.length > 9 ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : d.length > 5 ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
  if (d.length > 10) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length > 6) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
}
const PHONE_WHO = ["부", "모", "본인"] as const;

type PostcodeData = { userSelectedType: "R" | "J"; roadAddress: string; jibunAddress: string; bname: string; buildingName: string; apartment: "Y" | "N" };
type PostcodeApi = {
  Postcode: new (o: { oncomplete: (d: PostcodeData) => void; width?: string; height?: string }) => { open: (o?: { popupTitle?: string; popupKey?: string; left?: number; top?: number }) => void };
};
const POSTCODE_SRC = "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
let postcodeLoading: Promise<PostcodeApi> | null = null;
/** 카카오(다음) 우편번호 서비스 스크립트를 한 번만 불러옴 */
function loadPostcode(): Promise<PostcodeApi> {
  const w = window as unknown as { daum?: PostcodeApi };
  if (w.daum?.Postcode) return Promise.resolve(w.daum);
  postcodeLoading ??= new Promise<PostcodeApi>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = POSTCODE_SRC;
    el.async = true;
    el.onload = () => (w.daum?.Postcode ? resolve(w.daum) : reject(new Error("no postcode")));
    el.onerror = () => {
      postcodeLoading = null;
      el.remove();
      reject(new Error("load failed"));
    };
    document.head.appendChild(el);
  });
  return postcodeLoading;
}
/** 고른 주소: 도로명(또는 지번) 주소 + (법정동, 아파트 이름) */
function postcodeAddress(d: PostcodeData) {
  if (d.userSelectedType !== "R") return d.jibunAddress;
  const extra = [/[동로가]$/.test(d.bname) ? d.bname : "", d.buildingName && d.apartment === "Y" ? d.buildingName : ""].filter(Boolean).join(", ");
  return extra ? `${d.roadAddress} (${extra})` : d.roadAddress;
}

/** 주소 검색 (카카오 우편번호 서비스를 새 창으로 띄움) + 세부주소 */
function AddressInput({ base, detail, onBase, onDetail }: { base: string; detail: string; onBase: (v: string) => void; onDetail: (v: string) => void }) {
  const [failed, setFailed] = useState(false);
  const api = useRef<PostcodeApi | null>(null);
  const detailRef = useRef<HTMLInputElement>(null);
  // 미리 불러 둬야 단추를 누르는 순간 바로 새 창을 띄움 (늦게 띄우면 브라우저가 팝업을 막음)
  useEffect(() => {
    let cancelled = false;
    loadPostcode()
      .then((a) => {
        if (!cancelled) api.current = a;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const search = async () => {
    const a = api.current ?? (await loadPostcode().catch(() => null));
    if (!a) return setFailed(true);
    const w = 500;
    const h = 600;
    new a.Postcode({
      width: `${w}px`,
      height: `${h}px`,
      oncomplete: (d) => {
        onBase(postcodeAddress(d));
        setTimeout(() => detailRef.current?.focus(), 0);
      },
    }).open({ popupTitle: "주소 검색", popupKey: "iepAddress", left: Math.round(window.screenX + (window.outerWidth - w) / 2), top: Math.round(window.screenY + (window.outerHeight - h) / 2) });
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={base}
          onChange={(e) => onBase(e.target.value)}
          readOnly={!failed}
          onClick={() => !failed && search()}
          placeholder={failed ? "주소를 직접 적어 주세요" : "주소 검색을 눌러 찾아 주세요"}
          className={`${wizInput} ${failed ? "" : "cursor-pointer"}`}
          aria-label="주소"
        />
        {!failed && (
          <button type="button" onClick={search} className="shrink-0 rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900">
            주소 검색
          </button>
        )}
      </div>
      {failed && <p className="text-xs text-amber-700">주소 검색을 불러오지 못했어요. 주소를 직접 적어 주세요.</p>}
      <input ref={detailRef} value={detail} onChange={(e) => onDetail(e.target.value)} placeholder="세부주소 (동 · 호수 등)" className={wizInput} aria-label="세부주소" />
    </div>
  );
}

/** 학생 추가 창의 항목 이름 (창 제목보다 조금 작게) */
const BigLabel = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 block text-[15px] font-semibold text-slate-700">{label}</span>
    {children}
  </label>
);
const chip = (on: boolean) => `rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-inset transition ${on ? "bg-indigo-600 text-white ring-indigo-600" : "text-slate-600 ring-slate-200 hover:bg-slate-50"}`;

/** 학생 추가: 다섯 단계로 인적 사항을 받고, 과목마다의 계획을 만듦 */
function StudentWizard({ onCancel, onDone }: { onCancel: () => void; onDone: (sid: string) => void }) {
  const { values, set } = useIep();
  const { step, goStep, fadeClass } = useStepFlow();
  const [s, setS] = useState<StudentInput>(EMPTY_STUDENT);
  const [birthIso, setBirthIso] = useState("");
  const [selectedIso, setSelectedIso] = useState("");
  const [addr, setAddr] = useState({ base: "", detail: "" });
  const [phone, setPhone] = useState({ number: "", who: "" });
  const [health, setHealth] = useState<{ kind: "" | "양호" | "기타"; text: string }>({ kind: "", text: "" });
  const [career, setCareer] = useState<{ kind: "" | "미정" | "기타"; text: string }>({ kind: "", text: "" });
  const [error, setError] = useState<string | null>(null);
  const up = (k: keyof StudentInput) => (e: { target: { value: string } }) => setS((x) => ({ ...x, [k]: e.target.value }));
  const onBase = useCallback((v: string) => setAddr((a) => ({ ...a, base: v })), []);
  const steps = ["이름 · 학년과 반 · 번호 · 수강 과목", "주소 · 전화번호 · 생년월일", "학부모 · 통합교사 이름", "장애유형 및 등급 · 특수교육대상 선정년도 · 건강상태 · 병력 및 약물복용", "행동 특성", "학부모 요구 · 졸업 후 진로"];
  const next = () => {
    if (step === 0 && !s.name.trim()) return setError("이름을 적어 주세요.");
    if (step === 1 && phone.number && !phone.who) return setError("전화번호가 부 · 모 · 본인 중 누구의 번호인지 골라 주세요.");
    setError(null);
    if (step < steps.length - 1) return goStep(step + 1);
    const sid = newSectionId();
    const input: StudentInput = {
      ...s,
      name: s.name.trim(),
      birth: birthIso ? fmtDate(birthIso) : s.birth,
      address: [addr.base.trim(), addr.detail.trim()].filter(Boolean).join(" "),
      phone: phone.number ? `${phone.number}${phone.who ? ` (${phone.who})` : ""}` : "",
      selectedYear: selectedIso ? fmtDate(selectedIso) : "",
      health: health.kind === "기타" ? health.text.trim() || "기타" : health.kind,
      career: career.kind === "기타" ? career.text.trim() || "기타" : career.kind,
    };
    for (const [k, v] of Object.entries(studentFieldsV2(values, sid, input))) set(k, v);
    set("studentList", JSON.stringify([...parseList(values.studentList), sid]));
    onDone(sid);
  };
  return (
    <Wizard title={s.name.trim() ? `${s.name.trim()} 학생 추가` : "학생 추가"} steps={steps} step={step} onBack={() => goStep(step - 1)} onNext={next} onCancel={onCancel} hints={false} fadeClass={fadeClass}>
      {step === 0 && (
        <>
          <BigLabel label="이름">
            <input value={s.name} onChange={up("name")} maxLength={20} className={wizInput} autoFocus />
          </BigLabel>
          <div className="grid grid-cols-3 gap-3">
            <BigLabel label="학년">
              <select value={s.grade} onChange={up("grade")} className={wizInput}>
                {["1", "2", "3"].map((g) => (
                  <option key={g} value={g}>
                    {g}학년
                  </option>
                ))}
              </select>
            </BigLabel>
            <BigLabel label="반">
              <select value={s.cls} onChange={up("cls")} className={wizInput}>
                <option value="" disabled>
                  선택
                </option>
                {["1", "2", "3", "4"].map((c) => (
                  <option key={c} value={c}>
                    {c}반
                  </option>
                ))}
              </select>
            </BigLabel>
            <BigLabel label="번호">
              <input value={s.number} onChange={(e) => setS((x) => ({ ...x, number: e.target.value.replace(/\D/g, "").slice(0, 2) }))} inputMode="numeric" className={wizInput} />
            </BigLabel>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-[15px] font-semibold text-slate-700">수강 과목</legend>
            <div className="flex gap-2">
              {SUBJECTS_V2.map((x) => {
                const on = s.subjects.includes(x);
                return (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setS((v) => ({ ...v, subjects: on ? v.subjects.filter((y) => y !== x) : [...v.subjects, x] }))}
                    className={chip(on)}
                  >
                    {x}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </>
      )}
      {step === 1 && (
        <>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">주소</span>
            <AddressInput base={addr.base} detail={addr.detail} onBase={onBase} onDetail={(v) => setAddr((a) => ({ ...a, detail: v }))} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">전화번호</span>
            <div className="flex gap-2">
              <input
                value={phone.number}
                onChange={(e) => setPhone((p) => ({ ...p, number: fmtPhone(e.target.value) }))}
                inputMode="tel"
                placeholder="010-0000-0000"
                className={wizInput}
                aria-label="전화번호"
              />
              <div className="flex shrink-0 gap-1" role="group" aria-label="누구의 번호인지">
                {PHONE_WHO.map((w) => (
                  <button key={w} type="button" aria-pressed={phone.who === w} onClick={() => setPhone((p) => ({ ...p, who: p.who === w ? "" : w }))} className={chip(phone.who === w)}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
            {phone.number && phone.who && <p className="mt-1 text-xs text-slate-500">{`${phone.number} (${phone.who})`}</p>}
          </div>
          <Labeled2 label="생년월일">
            <input type="date" value={birthIso} onChange={(e) => setBirthIso(e.target.value)} className={wizInput} />
          </Labeled2>
        </>
      )}
      {step === 2 && (
        <>
          <Labeled2 label="학부모 이름">
            <input value={s.parent ?? ""} onChange={(e) => setS((x) => ({ ...x, parent: e.target.value.slice(0, 20) }))} className={wizInput} autoFocus />
          </Labeled2>
          <Labeled2 label="통합교사 이름">
            <input value={s.inc ?? ""} onChange={(e) => setS((x) => ({ ...x, inc: e.target.value.slice(0, 40) }))} className={wizInput} />
          </Labeled2>
        </>
      )}
      {step === 3 && (
        <>
          <Labeled2 label="장애유형 및 등급">
            <input value={s.disability} onChange={up("disability")} className={wizInput} autoFocus />
          </Labeled2>
          <Labeled2 label="특수교육대상 선정년도">
            <input type="date" value={selectedIso} onChange={(e) => setSelectedIso(e.target.value)} className={wizInput} />
          </Labeled2>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-slate-600">건강상태</legend>
            <div className="flex items-center gap-2">
              {(["양호", "기타"] as const).map((h) => (
                <button key={h} type="button" aria-pressed={health.kind === h} onClick={() => setHealth((x) => ({ ...x, kind: x.kind === h ? "" : h }))} className={chip(health.kind === h)}>
                  {h}
                </button>
              ))}
              {health.kind === "기타" && (
                <input value={health.text} onChange={(e) => setHealth((x) => ({ ...x, text: e.target.value }))} placeholder="건강상태를 적어 주세요" className={wizInput} aria-label="건강상태" autoFocus />
              )}
            </div>
          </fieldset>
          <Labeled2 label="병력 및 약물복용">
            <input value={s.medical} onChange={up("medical")} className={wizInput} />
          </Labeled2>
        </>
      )}
      {step === 4 && (
        <Labeled2 label="행동 특성">
          <textarea value={s.behavior} onChange={up("behavior")} rows={6} className={wizArea} autoFocus />
        </Labeled2>
      )}
      {step === 5 && (
        <>
          <Labeled2 label="학부모 요구">
            <textarea value={s.parentNeeds} onChange={up("parentNeeds")} rows={3} className={wizArea} autoFocus />
          </Labeled2>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-slate-600">졸업 후 진로</legend>
            <div className="flex items-center gap-2">
              {(["미정", "기타"] as const).map((h) => (
                <button key={h} type="button" aria-pressed={career.kind === h} onClick={() => setCareer((x) => ({ ...x, kind: x.kind === h ? "" : h }))} className={chip(career.kind === h)}>
                  {h}
                </button>
              ))}
              {career.kind === "기타" && (
                <input value={career.text} onChange={(e) => setCareer((x) => ({ ...x, text: e.target.value }))} placeholder="졸업 후 진로를 적어 주세요" className={wizInput} aria-label="졸업 후 진로" autoFocus />
              )}
            </div>
          </fieldset>
        </>
      )}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </Wizard>
  );
}

/** 고른 글꼴 이름 → CSS 글꼴 목록 */
const fontFamilyOf = (name: string) => `"${name.replace(/"/g, "")}", ${/바탕|명조/.test(name) ? '"Batang", "AppleMyungjo", serif' : '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif'}`;
/** 칸마다 고른 글자 모양을 저장하는 칸 이름 */
const fmtKey = (field: string) => `fmt.${field}`;
type CellFmt = { font?: string; size?: number; ls?: number; bold?: boolean };
const readFmt = (raw: string | undefined): CellFmt => {
  try {
    const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return { font: typeof o.font === "string" ? o.font : undefined, size: typeof o.size === "number" ? o.size : undefined, ls: typeof o.ls === "number" ? o.ls : undefined, bold: typeof o.bold === "boolean" ? o.bold : undefined };
  } catch {
    return {};
  }
};
/** 양식 모양 위에 고른 글자 모양(글꼴 · 크기 · 줄 간격)을 얹음 */
function withFormat(base: FormStyle, raw: string | undefined): FormStyle {
  const o = readFmt(raw);
  return { ...base, ...(o.font ? { fontName: o.font, font: fontFamilyOf(o.font) } : {}), ...(o.size ? { size: o.size } : {}), ...(o.ls ? { ls: o.ls } : {}), ...(o.bold !== undefined ? { bold: o.bold } : {}) };
}

/** 한 칸: 이어진 저장 칸을 바로 고치고, 이어지지 않은 칸(양식 글)은 그대로 보여 줌. 문단마다 그 문단의 글자 모양으로 */
function CellV2({ cell, canRemoveGoal, onRemoveGoal }: { cell: V2Cell; canRemoveGoal: boolean; onRemoveGoal: () => void }) {
  const { values, set } = useIep();
  const paraStyle = (i: number): FormStyle => cell.styles?.[i] ?? cell;
  const b = cell.bind;
  if (!b) {
    const lines = cell.lines?.length ? cell.lines : [cell.text];
    return (
      <div className="break-words px-1.5 py-[2px] text-slate-800">
        {lines.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap" style={cellStyle(paraStyle(i))}>
            {l || " "}
          </div>
        ))}
      </div>
    );
  }
  if ("choice" in b) {
    const on = values[b.choice.field] === b.choice.value;
    return (
      <button
        type="button"
        onClick={() => set(b.choice.field, on ? "" : b.choice.value)}
        aria-pressed={on}
        aria-label={`성취평가 ${b.choice.value}점`}
        className="grid h-full min-h-7 w-full place-items-center font-bold text-indigo-700 transition hover:bg-indigo-50"
        style={cellStyle(paraStyle(0))}
      >
        {on ? "○" : ""}
      </button>
    );
  }
  if ("parts" in b) {
    return (
      <div className="px-0.5">
        {b.parts.map((p, i) => {
          const st = cellStyle(withFormat(paraStyle(i), values[fmtKey(p.field)]));
          return (
            <div key={p.field} className="flex items-start">
              {p.label && (
                <span className="shrink-0 py-[2px] pl-1 text-slate-800" style={{ ...st, fontFamily: cellStyle(paraStyle(i)).fontFamily }}>
                  {p.label}
                </span>
              )}
              <F k={p.field} className="min-w-0 flex-1" style={p.label ? { ...st, textAlign: "left" } : st} />
            </div>
          );
        })}
      </div>
    );
  }
  const st = cellStyle(withFormat(paraStyle(b.para ?? 0), values[fmtKey(b.field)]));
  return (
    <div className="group/cell relative">
      {b.para !== undefined &&
        (cell.lines ?? []).slice(0, b.para).map((l, i) => (
          <div key={i} className="whitespace-pre-wrap px-1.5 pt-[2px] text-slate-800" style={cellStyle(paraStyle(i))}>
            {l}
          </div>
        ))}
      <F k={b.field} style={st} />
      {cell.goal && canRemoveGoal && (
        <button
          type="button"
          onClick={onRemoveGoal}
          aria-label="이 단기목표 줄 지우기"
          title="이 단기목표 줄 지우기"
          className="absolute -left-7 top-1/2 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-white text-slate-400 shadow ring-1 ring-slate-200 hover:text-red-600 group-hover/cell:grid"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** 칸(td)의 빈 곳을 눌러도 그 칸을 고치게: 누른 곳에서 가장 가까운 글 상자로 커서를 옮김 (성취평가 칸은 누른 것처럼) */
function focusCell(e: ReactMouseEvent<HTMLElement>) {
  const target = e.target as HTMLElement;
  if (target.closest("textarea, input, button, select, a, [data-resize]")) return;
  const areas = Array.from(e.currentTarget.querySelectorAll("textarea"));
  if (!areas.length) {
    const btn = e.currentTarget.querySelector("button");
    if (btn) {
      e.preventDefault();
      btn.click();
    }
    return;
  }
  const dist = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
  };
  const el = areas.reduce((best, a) => (dist(a) < dist(best) ? a : best));
  e.preventDefault();
  el.focus();
  const end = el.value.length;
  el.setSelectionRange(end, end);
}

/** 쪽에 놓는 조각: 문단 묶음 하나, 또는 표의 from~to 줄 (표가 쪽을 넘으면 줄 단위로 나눔) */
type PagePiece = { bi: number; from?: number; to?: number };
/** 화면에 그린 높이(px): 문단 묶음 · 표의 줄마다 · 표에서 줄 말고 더 차지하는 높이(테두리 등) */
type Measure = { h: Record<number, number>; rows: Record<number, number[]>; extra: Record<number, number> };

/**
 * 쪽 나누기: 쪽 크기는 그대로 두고, 넘치는 내용은 다음 쪽으로 (한글처럼).
 * 새 쪽 표시가 있는 문단은 늘 새 쪽에서 · 나누지 않는 표는 통째로 다음 쪽으로 · 나눌 수 있는 표(또는 한 쪽보다 큰 표)는 줄 단위로 나눔.
 */
function paginate(blocks: V2Block[], height: number, m: Measure | null): PagePiece[][] {
  // 화면 배율에 따라 글 높이를 재는 값이 1px 안팎으로 달라도 쪽 나누기가 뒤바뀌지 않게 약간의 여유를 둠
  const limit = height + 1;
  const pages: PagePiece[][] = [[]];
  let used = 0;
  const page = () => pages[pages.length - 1];
  const newPage = () => {
    pages.push([]);
    used = 0;
  };
  blocks.forEach((b, bi) => {
    if (b.page && page().length) newPage();
    if (b.type === "table") {
      const rh = m?.rows[bi];
      if (!rh) {
        page().push({ bi });
        return;
      }
      const extra = m?.extra[bi] ?? 0;
      const total = rh.reduce((n, x) => n + (x || 0), 0) + extra;
      if (used + total <= limit) {
        page().push({ bi });
        used += total;
        return;
      }
      if (!b.split && total <= limit) {
        if (page().length) newPage();
        page().push({ bi });
        used += total;
        return;
      }
      let r = 0;
      while (r < rh.length) {
        let k = r;
        let sum = extra;
        while (k < rh.length && used + sum + (rh[k] || 0) <= limit) sum += rh[k++] || 0;
        if (k === r) {
          if (used > 0) {
            newPage();
            continue;
          }
          sum += rh[k++] || 0; // 한 줄이 쪽보다 큼: 그 줄만 한 쪽에
        }
        page().push({ bi, from: r, to: k });
        used += sum;
        r = k;
        if (r < rh.length) newPage();
      }
      return;
    }
    const h = m?.h[bi] ?? 0;
    const empty = b.type === "p" && !b.text;
    // 빈 문단은 쪽 끝에서 넘치거나 넘어간 쪽 맨 앞이면 뺌 (한글도 빈 줄 때문에 쪽을 늘리지 않음)
    if (empty && m && (used + h > limit || (used === 0 && !b.page))) return;
    // 한 쪽의 마지막 글(표지 맨 아래 학교 이름 등)이 안 들어가면, 그 앞의 빈 줄을 줄여서라도 같은 쪽에 둠 (한글 원본은 한 쪽에 보임)
    if (m && !empty && used + h > limit && (bi === blocks.length - 1 || blocks[bi + 1].page)) {
      for (;;) {
        const last = page()[page().length - 1];
        const lb = last && blocks[last.bi];
        if (!last || last.from !== undefined || lb.type !== "p" || lb.text) break;
        page().pop();
        used -= m.h[last.bi] ?? 0;
      }
    }
    if (m && used + h > limit && used > 0) newPage();
    page().push({ bi });
    used += h;
  });
  return pages.filter((p) => p.length);
}

const sameMeasure = (a: Measure, b: Measure) => JSON.stringify(a) === JSON.stringify(b);

/** 칸 이름 → 그 칸이 든 학생 (표지 · 학생과 상관없는 칸은 null) */
function sidOfField(values: Record<string, string>, field: string): string | null {
  const st = /^st\.([a-z0-9]+)\./.exec(field);
  if (st) return st[1];
  const s = /^s\.([a-z0-9]+)\./.exec(field);
  if (s) return parseList(values.studentList).find((sid) => parseList(values[studentKey(sid, "sectionList")]).includes(s[1])) ?? null;
  return null;
}

const SIZES = [8, 9, 10, 10.5, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40];
const SPACINGS = [100, 120, 130, 140, 150, 160, 170, 180, 200, 220, 250, 300];

/** 글자 모양 막대: 지금 고치는 칸의 글꼴 · 크기 · 줄 간격 (한글 편집기처럼) */
function FormatBar({ field, base, fonts, onDone }: { field: string | null; base: FormStyle | null; fonts: string[]; onDone: () => void }) {
  const { values, set } = useIep();
  const cur = field ? readFmt(values[fmtKey(field)]) : {};
  const font = cur.font ?? base?.fontName ?? "";
  const size = cur.size ?? base?.size ?? 10;
  const ls = cur.ls ?? base?.ls ?? 160;
  const bold = cur.bold ?? base?.bold ?? false;
  const apply = (patch: CellFmt) => {
    if (!field) return;
    const next = { ...cur, ...patch };
    set(fmtKey(field), JSON.stringify(next));
    onDone();
  };
  const sizeAt = (d: 1 | -1) => {
    const i = SIZES.findIndex((x) => x >= size);
    const at = i < 0 ? SIZES.length - 1 : SIZES[i] === size ? i + d : d > 0 ? i : i - 1;
    return SIZES[Math.min(SIZES.length - 1, Math.max(0, at))];
  };
  const box = "h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-indigo-500 disabled:opacity-50";
  const off = !field;
  return createPortal(
    <div
      data-follow-ui
      onMouseDown={(e) => {
        // 단추를 눌러도 고치던 칸에서 커서가 빠지지 않게 (고르는 상자는 그대로 열림)
        if (!(e.target as HTMLElement).closest("select")) e.preventDefault();
      }}
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 shadow-lg ring-1 ring-slate-200 backdrop-blur print:hidden"
      role="toolbar"
      aria-label="글자 모양"
    >
      <select aria-label="글꼴" value={fonts.includes(font) ? font : ""} disabled={off} onChange={(e) => apply({ font: e.target.value || undefined })} className={`${box} w-36`} style={{ fontFamily: font ? fontFamilyOf(font) : undefined }}>
        {!fonts.includes(font) && <option value="">글꼴</option>}
        {fonts.map((f) => (
          <option key={f} value={f} style={{ fontFamily: fontFamilyOf(f) }}>
            {f}
          </option>
        ))}
      </select>
      <div className="flex items-center">
        <button type="button" disabled={off} onClick={() => apply({ size: sizeAt(-1) })} aria-label="글자 작게" className="grid h-9 w-8 place-items-center rounded-l-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          −
        </button>
        <select aria-label="글자 크기(pt)" value={String(size)} disabled={off} onChange={(e) => apply({ size: Number(e.target.value) })} className={`${box} -ml-px w-[4.5rem] rounded-none`}>
          {[...new Set([...SIZES, size])].sort((a, b) => a - b).map((s) => (
            <option key={s} value={String(s)}>
              {s}pt
            </option>
          ))}
        </select>
        <button type="button" disabled={off} onClick={() => apply({ size: sizeAt(1) })} aria-label="글자 크게" className="-ml-px grid h-9 w-8 place-items-center rounded-r-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          +
        </button>
      </div>
      <button type="button" disabled={off} onClick={() => apply({ bold: !bold })} aria-pressed={bold} aria-label="굵게 (Ctrl+B)" title="굵게 (Ctrl+B)" className={`grid h-9 w-9 place-items-center rounded-lg border text-sm font-extrabold disabled:opacity-50 ${bold ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
        B
      </button>
      <label className="flex items-center gap-1 text-xs font-semibold text-slate-500">
        줄 간격
        <select aria-label="줄 간격(%)" value={String(ls)} disabled={off} onChange={(e) => apply({ ls: Number(e.target.value) })} className={`${box} w-20`}>
          {[...new Set([...SPACINGS, ls])].sort((a, b) => a - b).map((s) => (
            <option key={s} value={String(s)}>
              {s}%
            </option>
          ))}
        </select>
      </label>
      {field && (cur.font || cur.size || cur.ls || cur.bold !== undefined) && (
        <button type="button" onClick={() => {
            set(fmtKey(field), "");
            onDone();
          }} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">
          양식대로
        </button>
      )}
      {off && <span className="pl-1 text-xs text-slate-400">칸을 누르면 글자 모양을 바꿀 수 있어요</span>}
    </div>,
    document.body,
  );
}

/** 표 테두리 끌기: 열 경계(좌우) · 줄 경계(위아래) */
type DragState = { bi: number; kind: "col" | "row"; i: number; start: number; d: number; base: number[]; scale: number };

/** 학교 한글 파일 형식 그대로의 개별화교육계획: 처음 설정 → 표지 → 「학생 추가」로 학생마다 인적 사항과 과목별 계획 */
function DocV2({ sid, onSid, follow }: { sid: string | null; onSid: (sid: string | null) => void; follow: { field: string } | null }) {
  const { values, set, who } = useIep();
  const [layout, setLayout] = useState<{ data: V2Layout; v: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  /** 재어 둔 높이 (학생마다). 모양을 새로 받아도 다시 잴 때까지 앞서 잰 높이로 쪽을 나눠 화면이 흔들리지 않게 함 */
  const [meas, setMeas] = useState<{ key: string; sid: string; m: Measure } | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** 끌어서 바꾼 크기: 새 모양을 받을 때까지 화면에 그대로 둠 */
  const [held, setHeld] = useState<{ v: number; bi: number; cols?: number[]; row?: { i: number; h: number } } | null>(null);
  const latest = useRef(values);
  const box = useRef<HTMLDivElement>(null);
  /** 마지막으로 고치던 글 상자 (쪽이 바뀌어 다시 그려지면 그 자리로 커서를 돌려 놓음) */
  const lastFocus = useRef<{ el: HTMLTextAreaElement; field: string; s: number; e: number } | null>(null);
  useEffect(() => {
    latest.current = values;
  });
  const skey = structureKey(values);

  // 학생 · 영역 · 단기목표 줄 · 표 크기 · 글자 모양이 바뀌면 조립한 한글 문서의 모양을 다시 받음
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/iep/layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: latest.current }) });
        const data = (await res.json()) as V2Layout & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "양식을 만들지 못했어요.");
        if (!cancelled) {
          setLayout((old) => ({ data, v: (old?.v ?? 0) + 1 }));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "양식을 만들지 못했어요.");
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [skey]);

  const data = layout?.data ?? null;
  const followSid = follow ? sidOfField(values, follow.field) : null;
  const sec = data ? (data.sections.find((x) => x.sid === (followSid ?? sid)) ?? data.sections[0]) : null;
  const pg = data?.page ?? { width: 794, height: 1123, left: 93, right: 94, top: 76, bottom: 62 };
  const contentW = pg.width - pg.left - pg.right;
  const contentH = pg.height - pg.top - pg.bottom;
  const mkey = `${layout?.v ?? 0}:${sec?.sid ?? ""}`;
  const sidNow = sec?.sid ?? "";
  const usable = meas && meas.sid === (sec?.sid ?? "") ? meas.m : null;
  // 한글은 글자를 약간 촘촘히 그려 같은 내용이 쪽에 더 들어가므로, 화면은 아래 여백 안쪽까지(여백 8px 남김) 쓰는 것을 넘침으로 보지 않음
  const slack = Math.max(0, pg.bottom - 8);
  const plan = useMemo(() => (sec ? paginate(sec.blocks, contentH + slack, usable) : []), [sec, contentH, slack, usable]);
  const planSig = JSON.stringify(plan);

  // 그린 높이를 재어 쪽을 나눔. 글을 적어 칸이 커지면 다시 잼
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const m: Measure = { h: {}, rows: {}, extra: {} };
      root.querySelectorAll<HTMLElement>("[data-bi]").forEach((el) => {
        const bi = Number(el.dataset.bi);
        const r2 = (x: number) => Math.round(x * 2) / 2;
        if (el.dataset.table) {
          let sum = 0;
          const rows = (m.rows[bi] ??= []);
          el.querySelectorAll<HTMLElement>("tr[data-r]").forEach((tr) => {
            const h = r2(tr.getBoundingClientRect().height);
            const r = Number(tr.dataset.r);
            rows[r] = Math.max(rows[r] ?? 0, h);
            sum += h;
          });
          m.extra[bi] = Math.max(m.extra[bi] ?? 0, r2(el.getBoundingClientRect().height - sum));
        } else m.h[bi] = r2(el.getBoundingClientRect().height);
      });
      for (const k of Object.keys(m.rows)) m.rows[Number(k)] = Array.from(m.rows[Number(k)], (x) => x ?? 0);
      setMeas((old) => {
        // 지금 그리지 않은 묶음(쪽 끝에서 뺀 빈 줄 등)은 앞서 잰 높이를 그대로 둠 (없으면 0 으로 보여 쪽 나누기가 흔들림)
        const merged: Measure = old && old.sid === sidNow ? { h: { ...old.m.h, ...m.h }, rows: { ...old.m.rows, ...m.rows }, extra: { ...old.m.extra, ...m.extra } } : m;
        return old && old.key === mkey && sameMeasure(old.m, merged) ? old : { key: mkey, sid: sidNow, m: merged };
      });
    };
    let timer = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
      // 창이 가려져 그리기가 멈춘 때에도 재도록
      clearTimeout(timer);
      timer = window.setTimeout(() => frame && (cancelAnimationFrame(frame), measure()), 150);
    };
    const ro = new ResizeObserver(schedule);
    root.querySelectorAll("[data-bi]").forEach((el) => ro.observe(el));
    schedule();
    // 쪽이 바뀌어 고치던 글 상자가 다시 그려졌으면 같은 칸 · 같은 자리로 커서를 돌려 놓음
    const lf = lastFocus.current;
    if (lf && !lf.el.isConnected && (document.activeElement === document.body || !document.activeElement)) {
      const next = root.querySelector<HTMLTextAreaElement>(`textarea[data-field="${CSS.escape(lf.field)}"]`);
      if (next) {
        next.focus({ preventScroll: true });
        next.setSelectionRange(lf.s, lf.e);
        lastFocus.current = { ...lf, el: next };
      }
    }
    return () => {
      ro.disconnect();
      clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [planSig, mkey, sidNow]);

  // 따라가기: 따라가는 선생님이 고치는 칸으로 화면을 옮김
  const followField = follow?.field ?? "";
  useEffect(() => {
    if (!followField) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-field="${CSS.escape(followField)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [followField, planSig]);

  /** 칸 이름 → 그 칸(문단)의 양식 글자 모양 (글자 모양 막대에 지금 값으로 보여 줌) */
  const baseStyles = useMemo(() => {
    const map = new Map<string, FormStyle>();
    for (const b of sec?.blocks ?? []) {
      if (b.type !== "table") continue;
      for (const c of b.cells as V2Cell[]) {
        const bind = c.bind;
        if (!bind || "choice" in bind) continue;
        if ("parts" in bind) bind.parts.forEach((p, i) => map.set(p.field, c.styles?.[i] ?? c));
        else map.set(bind.field, c.styles?.[bind.para ?? 0] ?? c);
      }
    }
    return map;
  }, [sec]);

  if (!values.setup) return <SetupWizard />;
  if (error && !data) return <p className="mx-auto max-w-md rounded-xl bg-red-50 p-6 text-center text-sm text-red-700">{error}</p>;
  if (!data || !sec)
    return (
      <div className="grid place-items-center py-20">
        <Spinner className="h-8 w-8 text-indigo-600" />
      </div>
    );

  const students = data.sections.filter((x) => x.sid);
  const nameOf = (id: string | null) => (id ? (values[studentKey(id, "name")] ?? "").trim() || "이름 없음" : "표지");
  // 왼쪽 학생 목록: 학년마다
  const groups = new Map<string, string[]>();
  for (const x of students) {
    const g = (values[studentKey(x.sid!, "grade")] ?? "").trim();
    groups.set(g, [...(groups.get(g) ?? []), x.sid!]);
  }
  const busySids = new Set(Object.keys(who).map((f) => sidOfField(values, f)));

  // 끌어서 바꾸는 표 크기 (끄는 중 → 놓은 뒤 새 모양을 받을 때까지)
  const colsOf = (b: Extract<V2Block, { type: "table" }>, bi: number) => {
    const w = colWidths(b);
    if (drag && drag.bi === bi && drag.kind === "col") {
      const out = [...drag.base];
      const d = drag.d / drag.scale;
      if (drag.i < out.length - 1) {
        const dd = Math.max(12 - out[drag.i], Math.min(out[drag.i + 1] - 12, d));
        out[drag.i] += dd;
        out[drag.i + 1] -= dd;
      } else out[drag.i] = Math.max(12, out[drag.i] + d);
      return out;
    }
    if (held && held.v === layout!.v && held.bi === bi && held.cols) return held.cols;
    return w;
  };
  const rowOverride = (bi: number): { i: number; h: number } | null => {
    if (drag && drag.bi === bi && drag.kind === "row") return { i: drag.i, h: Math.max(10, drag.base[drag.i] + drag.d) };
    if (held && held.v === layout!.v && held.bi === bi && held.row) return held.row;
    return null;
  };
  const saveSize = (b: Extract<V2Block, { type: "table" }>, patch: { c?: number[]; r?: Record<string, number> }) => {
    if (!b.sizeId) return;
    const k = `size.${b.sizeId}`;
    let old: { c?: number[]; r?: Record<string, number> } = {};
    try {
      old = values[k] ? (JSON.parse(values[k]) as typeof old) : {};
    } catch {
      old = {};
    }
    set(k, JSON.stringify({ ...old, ...(patch.c ? { c: patch.c } : {}), ...(patch.r ? { r: { ...(old.r ?? {}), ...patch.r } } : {}) }));
  };
  const startDrag = (e: ReactPointerEvent<HTMLElement>, st: Omit<DragState, "start" | "d">) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ ...st, start: st.kind === "col" ? e.clientX : e.clientY, d: 0 });
  };
  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    setDrag({ ...drag, d: (drag.kind === "col" ? e.clientX : e.clientY) - drag.start });
  };
  const endDrag = (b: Extract<V2Block, { type: "table" }>, bi: number, scale: number) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (Math.abs(d.d) < 1) return;
    if (d.kind === "col") {
      const cols = colsOf(b, bi);
      setHeld({ v: layout!.v, bi, cols });
      saveSize(b, { c: cols.map((w) => Math.round(w * 75)) });
    } else {
      const h = Math.max(10, d.base[d.i] + d.d);
      const key = b.rowKeys?.[d.i];
      if (!key) return;
      setHeld({ v: layout!.v, bi, row: { i: d.i, h } });
      saveSize(b, { r: { [key]: Math.round((h / scale) * 75) } });
    }
  };

  const renderPiece = ({ bi, from, to }: PagePiece) => {
    const b = sec.blocks[bi];
    if (b.type === "object")
      return b.image && b.w ? (
        <div key={`o-${bi}`} data-bi={bi} className="flex" style={{ justifyContent: b.align === "right" ? "flex-end" : b.align === "left" ? "flex-start" : "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 한글 양식 안의 그림을 그대로 보여 줌 */}
          <img src="/api/iep/logo" alt="월계중학교 로고" width={b.w} height={b.h} style={{ width: b.w, height: b.h }} />
        </div>
      ) : (
        <div key={`o-${bi}`} data-bi={bi} />
      );
    if (b.type === "p")
      return b.text ? (
        <div key={`p-${bi}`} data-bi={bi} className="whitespace-pre-wrap" style={cellStyle(b)}>
          {b.text}
        </div>
      ) : (
        // 빈 문단도 한글 파일처럼 그 글자 크기 · 줄 간격만큼 띄움
        <div key={`p-${bi}`} data-bi={bi} style={{ height: `calc(${fontPx(b.size)} * ${(b.ls ?? 160) / 100})` }} />
      );
    const cols = colsOf(b, bi);
    const total = cols.reduce((n, x) => n + x, 0);
    const scale = Math.min(1, contentW / total);
    const goals = b.goalSec ? goalIdsOf(values, b.goalSec) : [];
    const r0 = from ?? 0;
    const r1 = to ?? b.rows;
    const rowO = rowOverride(bi);
    const cells = b.cells as V2Cell[];
    const measured = usable?.rows[bi];
    // 줄 · 열 경계 위치: 줄은 재어 둔 높이로, 열은 너비로
    const rowTop: number[] = [];
    let yy = 0;
    for (let r = r0; r <= r1; r++) {
      rowTop[r] = yy;
      if (r < r1) yy += rowO && rowO.i === r ? rowO.h : (measured?.[r] ?? 0);
    }
    const colLeft: number[] = [0];
    cols.forEach((w, i) => (colLeft[i + 1] = colLeft[i] + w * scale));
    /** 겹치거나 붙은 구간을 하나로 */
    const merge = (xs: [number, number][]) =>
      xs
        .sort((p, q) => p[0] - q[0])
        .reduce<[number, number][]>((out, [a, z]) => {
          const last = out[out.length - 1];
          if (last && a <= last[1] + 0.5) last[1] = Math.max(last[1], z);
          else out.push([a, z]);
          return out;
        }, []);
    const inPart = cells.filter((c) => c.r < r1 && c.r + c.rs > r0);
    // 테두리가 실제로 있는 곳에만 끄는 손잡이 (합친 칸 한가운데에는 없음, 한글처럼)
    const rowEdges = measured
      ? Array.from({ length: r1 - r0 }, (_, k) => r0 + k).flatMap((r) =>
          merge(inPart.filter((c) => c.r + c.rs - 1 === r).map((c): [number, number] => [colLeft[c.c], colLeft[c.c + c.cs]])).map(([x0, x1]) => ({ i: r, y: rowTop[r + 1], x0, x1 })),
        )
      : [];
    const colEdges = cols.flatMap((_, i) =>
      measured
        ? merge(inPart.filter((c) => c.c + c.cs - 1 === i).map((c): [number, number] => [rowTop[Math.max(c.r, r0)], rowTop[Math.min(c.r + c.rs, r1)]])).map(([y0, y1]) => ({ i, x: colLeft[i + 1], y0, y1 }))
        : [{ i, x: colLeft[i + 1], y0: 0, y1: -1 }],
    );
    return (
      <div key={`t-${bi}-${r0}`} data-bi={bi} data-table="1" className="relative mx-auto" style={{ width: total * scale }}>
        <table className="table-fixed border-collapse" style={{ width: total * scale }}>
          <colgroup>
            {cols.map((w, ci) => (
              <col key={ci} style={{ width: w * scale }} />
            ))}
          </colgroup>
          <tbody>
            {Array.from({ length: r1 - r0 }, (_, k) => {
              const r = r0 + k;
              // 이 조각에서 그릴 칸: 이 줄에서 시작하는 칸 + (조각 첫 줄이면) 앞 조각에서 이어져 내려온 칸
              const row = cells.filter((c) => c.r === r || (k === 0 && c.r < r && c.r + c.rs > r));
              return (
                <tr key={r} data-r={r} style={rowO && rowO.i === r ? { height: rowO.h } : undefined}>
                  {row
                    .sort((x, y) => x.c - y.c)
                    .map((c) => {
                      const cont = c.r < r; // 앞 조각에서 이어진 칸: 테두리 · 배경만
                      const span = Math.min(c.r + c.rs, r1) - Math.max(c.r, r0);
                      const clipped = cont || c.r + c.rs > r1;
                      const editable = !!c.bind && !cont;
                      const h = rowO && rowO.i === r && c.rs === 1 ? rowO.h : clipped ? undefined : Math.max(4, c.h * scale);
                      return (
                        <td
                          key={c.key}
                          rowSpan={span}
                          colSpan={c.cs}
                          onMouseDown={editable ? focusCell : undefined}
                          className={`p-0 ${editable ? "cursor-text" : ""}`}
                          style={{
                            ...borderStyle(c),
                            position: "relative",
                            background: c.bg ?? undefined,
                            verticalAlign: c.bind && !("choice" in c.bind) && c.align !== "center" ? "top" : c.valign,
                            height: h,
                          }}
                        >
                          {!cont && (
                            <CellV2
                              cell={c}
                              canRemoveGoal={goals.length > 1}
                              onRemoveGoal={() => c.goal && set(sk(c.goal.sec, "goalList"), JSON.stringify(goals.filter((g) => g !== c.goal!.gid)))}
                            />
                          )}
                          {/* 마지막 단기목표 줄 아래 선(성취평가 작성준거 바로 위)에 「단기목표 추가」 */}
                          {!cont && c.goal && c.goal.gid === goals[goals.length - 1] && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={() => set(sk(c.goal!.sec, "goalList"), JSON.stringify([...goals, newSectionId()]))}
                              className="absolute -bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-indigo-600 shadow-sm ring-1 ring-indigo-200 transition hover:bg-indigo-50"
                            >
                              <PlusIcon className="h-3.5 w-3.5" />
                              단기목표 추가
                            </button>
                          )}
                        </td>
                      );
                    })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* 테두리를 눌러 끌면 크기 바꾸기 (한글처럼): 세로선은 열 너비, 가로선은 줄 높이 */}
        {b.sizeId &&
          colEdges.map(({ i, x, y0, y1 }) => (
            <div
              key={`c${i}-${y0}`}
              data-resize
              title="끌어서 열 너비 바꾸기"
              onPointerDown={(e) => startDrag(e, { bi, kind: "col", i, base: cols, scale })}
              onPointerMove={moveDrag}
              onPointerUp={() => endDrag(b, bi, scale)}
              onPointerCancel={() => setDrag(null)}
              className={`absolute z-[5] w-[7px] -translate-x-1/2 cursor-col-resize touch-none hover:bg-indigo-400/40 ${drag?.bi === bi && drag.kind === "col" && drag.i === i ? "bg-indigo-500/50" : ""}`}
              style={y1 < 0 ? { left: x, top: 0, bottom: 0 } : { left: x, top: y0, height: y1 - y0 }}
            />
          ))}
        {b.sizeId &&
          b.rowKeys &&
          rowEdges.map(({ i, y, x0, x1 }) => (
            <div
              key={`r${i}-${x0}`}
              data-resize
              title="끌어서 줄 높이 바꾸기"
              onPointerDown={(e) => startDrag(e, { bi, kind: "row", i, base: measured ?? [], scale })}
              onPointerMove={moveDrag}
              onPointerUp={() => endDrag(b, bi, scale)}
              onPointerCancel={() => setDrag(null)}
              className={`absolute z-[5] h-[7px] -translate-y-1/2 cursor-row-resize touch-none hover:bg-indigo-400/40 ${drag?.bi === bi && drag.kind === "row" && drag.i === i ? "bg-indigo-500/50" : ""}`}
              style={{ top: y, left: x0, width: x1 - x0 }}
            />
          ))}
      </div>
    );
  };

  const curBase = cur ? (baseStyles.get(cur) ?? null) : null;

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
        {/* 왼쪽 학생 목록 (학년마다) */}
        {students.length > 0 && (
          <aside className="w-full max-w-[794px] shrink-0 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 lg:sticky lg:top-24 lg:w-48" aria-label="학생 목록">
            {[...groups.entries()]
              .sort(([a], [b]) => (a || "9").localeCompare(b || "9"))
              .map(([g, list]) => (
                <div key={g} className="mb-2 last:mb-0">
                  <p className="px-2 pb-1 pt-1 text-xs font-bold text-slate-400">{g ? `${g}학년` : "학년 없음"}</p>
                  <div className="flex flex-wrap gap-1 lg:flex-col">
                    {list.map((id) => {
                      const on = id === sec.sid;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => onSid(id)}
                          className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition ${on ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                        >
                          <span className="truncate">{nameOf(id)}</span>
                          {busySids.has(id) && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" title="다른 선생님이 고치는 중" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
              <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">
                <PlusIcon className="h-4 w-4" />
                학생 추가
              </button>
              {sec.sid && (
                <button type="button" onClick={() => setRemoving(sec.sid)} className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">
                  <TrashIcon className="h-3.5 w-3.5" />이 학생 지우기
                </button>
              )}
            </div>
          </aside>
        )}

        {/* 쪽마다 A4 종이 한 장 (크기 고정, 넘치는 내용은 다음 쪽으로). 좁은 화면에서는 옆으로 밀어서 봄 */}
        <div
          ref={box}
          // geometricPrecision: 글자 폭을 배율과 상관없이 같은 비율로 계산해, 화면 배율이 달라도 줄바꿈 · 쪽 나누기가 같게 함
          className="w-full min-w-0 space-y-6 overflow-x-auto pb-2 [text-rendering:geometricPrecision] [word-break:keep-all] [overflow-wrap:break-word] lg:w-auto"
          onFocusCapture={(e) => {
            const el = e.target as HTMLElement;
            if (el instanceof HTMLTextAreaElement && el.dataset.field) {
              setCur(el.dataset.field);
              lastFocus.current = { el, field: el.dataset.field, s: el.selectionStart, e: el.selectionEnd };
            }
          }}
          onSelectCapture={(e) => {
            const el = e.target as HTMLElement;
            if (el instanceof HTMLTextAreaElement && el.dataset.field) lastFocus.current = { el, field: el.dataset.field, s: el.selectionStart, e: el.selectionEnd };
          }}
          onBlurCapture={(e) => {
            // 다른 곳을 눌러 빠져나간 것이면 돌려 놓지 않음 (쪽이 바뀌어 다시 그려진 경우만 돌려 놓음)
            const el = e.target as HTMLElement;
            requestAnimationFrame(() => {
              if (el.isConnected && lastFocus.current?.el === el) lastFocus.current = null;
            });
          }}
        >
          {plan.map((page, pn) => (
            <div
              key={pn}
              className="relative mx-auto overflow-hidden bg-white shadow-md ring-1 ring-slate-200"
              style={{ width: pg.width, height: pg.height, padding: `${pg.top}px ${pg.right}px ${pg.bottom}px ${pg.left}px` }}
              aria-label={`${pn + 1}쪽`}
            >
              {page.map(renderPiece)}
              <span className="pointer-events-none absolute bottom-2 right-4 text-[10px] text-slate-300 select-none">{pn + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {students.length === 0 && (
        <div className="flex justify-center pb-6">
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700">
            <PlusIcon className="h-4 w-4" />
            학생 추가
          </button>
        </div>
      )}

      <FormatBar
        field={cur}
        base={curBase}
        fonts={data.fonts ?? []}
        onDone={() => {
          // 고른 뒤에는 고치던 칸으로 커서를 돌려 놓음
          const lf = lastFocus.current;
          const el = lf && box.current?.querySelector<HTMLTextAreaElement>(`textarea[data-field="${CSS.escape(lf.field)}"]`);
          if (el && lf) {
            el.focus({ preventScroll: true });
            el.setSelectionRange(lf.s, lf.e);
          }
        }}
      />

      {adding && (
        <StudentWizard
          onCancel={() => setAdding(false)}
          onDone={(id) => {
            setAdding(false);
            onSid(id);
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`${nameOf(removing)} 학생을 지울까요?`}
          confirmLabel="지우기"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            set("studentList", JSON.stringify(parseList(values.studentList).filter((x) => x !== removing)));
            setRemoving(null);
            onSid(null);
          }}
        >
          이 학생의 개별화교육계획이 함께 편집하는 선생님 화면에서도 사라지고, 한글 파일에도 들어가지 않아요.
        </ConfirmDialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 입력 칸

/**
 * 양식의 칸 하나. 글이 길어지면 칸이 아래로 늘어남.
 * 다른 선생님이 같은 칸을 고쳐 글이 바뀌어도 내 커서가 엉뚱한 곳으로 튀지 않게 커서 위치를 옮겨 줌.
 */
function F({
  k: name,
  className = "",
  center = false,
  single = false,
  ph = "",
  minRows = 1,
  fallback = "",
  style,
}: {
  k: string;
  className?: string;
  center?: boolean;
  single?: boolean;
  ph?: string;
  minRows?: number;
  /** 아직 아무도 고치지 않았을 때 보여 줄 글 (학교 양식의 원래 글) */
  fallback?: string;
  /** 글자 크기 · 굵기 · 정렬 (학교 양식의 모양) */
  style?: CSSProperties;
}) {
  const { values, set, focus, blur, compose, who, key } = useIep();
  const k = key(name);
  const value = values[k] ?? fallback;
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
    if (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")) {
      // 브라우저가 소수점 높이까지 그대로 맞춰 주므로 따로 정하지 않음 (scrollHeight 는 정수로 반올림돼 화면 배율마다 쪽 나누기가 달라짐)
      el.style.height = "";
    } else {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
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
        data-field={k}
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
        onKeyDown={(e) => {
          // Ctrl+B: 이 칸의 글을 굵게 / 굵지 않게 (글자 모양 막대의 B 와 같음)
          if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "b") {
            e.preventDefault();
            const cur = readFmt(values[fmtKey(k)]);
            const isBold = cur.bold ?? Number(style?.fontWeight ?? 400) >= 600;
            set(fmtKey(k), JSON.stringify({ ...cur, bold: !isBold }));
            return;
          }
          if (single && e.key === "Enter") e.preventDefault();
        }}
        onFocus={() => focus(k)}
        onBlur={() => {
          compose(k, false);
          blur(k);
        }}
        onCompositionStart={() => compose(k, true)}
        onCompositionEnd={() => compose(k, false)}
        className={`block w-full resize-none overflow-hidden rounded-[3px] bg-transparent px-1.5 py-[2px] text-[13px] leading-[1.55] text-slate-900 outline-none transition-[background-color,box-shadow] [field-sizing:content] placeholder:text-slate-300 hover:bg-slate-50 focus:bg-indigo-50/60 print:hidden ${center ? "text-center" : ""}`}
        style={{ ...style, ...(others ? { boxShadow: `inset 0 0 0 2px ${others[0].color}` } : {}) }}
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
function V({ k, fallback = "" }: { k: string; fallback?: string }) {
  const { values, key } = useIep();
  return <>{values[key(k)] || fallback}</>;
}

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
