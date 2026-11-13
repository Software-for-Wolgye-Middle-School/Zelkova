"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { login, logout } from "./auth";
import ConfirmDialog from "./ConfirmDialog";
import { ArrowLeftIcon, PlusIcon, RefreshIcon, Spinner, TrashIcon } from "./icons";

/**
 * 느티나무 소통게시판: 특수교사 · 특수교육실무사 · 사회복무요원 · 학부모가 함께 쓰는 학급 공지 · 학생별 알림장 · 활동 메모.
 * 권한 검사는 모두 서버(/api/board/*)에서 하고, 이 화면은 역할에 맞는 메뉴만 보여 줌.
 * 새 글은 화면을 열 때와 새로고침 단추를 누를 때 확인함 (Redis 사용량을 아끼려고 계속 묻지 않음).
 */

type BoardRole = "teacher" | "aide" | "sw" | "parent";
type Me = { role: BoardRole; userId: string; name: string; unread: { notices: number; messages: number; drafts: number } };
type Student = { id: string; name: string };
type Msg = { id: string; studentId: string; kind: "note" | "reply"; status: "sent" | "draft"; by: string; byRole: BoardRole; byName: string; at: number; body: string; read: boolean; readers?: string[] };
type Notice = { id: string; byName: string; at: number; title: string; body: string; read: boolean; readers?: string[] };
type Memo = { id: string; by: string; byRole: BoardRole; byName: string; at: number; date: string; body: string };
type User = { id: string; role: "aide" | "sw" | "parent"; loginId: string; name: string; studentIds: string[]; createdAt: number };

const ROLE_LABEL: Record<BoardRole, string> = { teacher: "특수교사", aide: "특수교육실무사", sw: "사회복무요원", parent: "학부모" };

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T = Record<string, unknown>>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  } catch {
    throw new ApiError(0, "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "처리하지 못했어요.");
  return data;
}

const fmt = (t: number) => new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
const todayStr = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

const btn = "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${btn} bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 hover:bg-indigo-700`;
const ghost = `${btn} text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50`;
const field = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";
const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

function Badge({ n }: { n: number }) {
  return n > 0 ? <span className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold leading-5 text-white">{n > 99 ? "99+" : n}</span> : null;
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-2 text-sm font-medium text-red-600">
      {error}
    </p>
  ) : null;
}

// ---------------------------------------------------------------- 맨 바깥

export default function BoardApp() {
  const [me, setMe] = useState<Me | null | "anon">(null);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api<Me>("GET", "/api/board/me"));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setMe("anon");
      else setError(e instanceof Error ? e.message : "불러오지 못했어요.");
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    api<Me>("GET", "/api/board/me")
      .then((m) => !cancelled && setMe(m))
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setMe("anon");
        else setError(e instanceof Error ? e.message : "불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 읽음 표시 등으로 새 글 수가 바뀌었을 때 (매번 새 함수가 되지 않게 고정) */
  const changed = useCallback(() => void loadMe(), [loadMe]);

  const signOut = async () => {
    await logout();
    setMe("anon");
  };

  return (
    <div className="fade-up mx-auto max-w-3xl">
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">느티나무 소통게시판</h1>
        {me && me !== "anon" && (
          <p className="mt-1.5 text-sm text-slate-500">
            {me.name} ({ROLE_LABEL[me.role]}) ·{" "}
            <button type="button" onClick={() => void signOut()} className="font-semibold text-slate-600 underline-offset-2 hover:underline">
              로그아웃
            </button>
          </p>
        )}
      </div>
      {error && <p className="mb-4 rounded-xl bg-red-50 p-4 text-center text-sm text-red-700">{error}</p>}
      {me === null ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8 text-indigo-600" />
        </div>
      ) : me === "anon" ? (
        <Gate onIn={() => void loadMe()} />
      ) : me.role === "parent" ? (
        <ParentView me={me} onChanged={changed} />
      ) : (
        <StaffView me={me} onChanged={changed} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 로그인 · 초대 코드로 가입

function Gate({ onIn }: { onIn: () => void }) {
  const [mode, setMode] = useState<"login" | "join">("login");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        const r = await login(id.trim(), password);
        if (!r.ok) throw new Error(r.error);
      } else {
        await api("POST", "/api/board/register", { code, loginId: id.trim(), password, name });
      }
      onIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리하지 못했어요.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${card} mx-auto max-w-sm`}>
      <div role="tablist" className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
        {(["login", "join"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => (setMode(m), setError(null))}
            className={`rounded-lg py-2 text-sm font-semibold transition ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            {m === "login" ? "로그인" : "초대 코드로 가입"}
          </button>
        ))}
      </div>
      <fieldset disabled={busy} className="space-y-3">
        {mode === "join" && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">초대 코드</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCDE-FGH23" autoComplete="off" className={`${field} font-mono tracking-widest`} />
              <span className="mt-1 block text-xs text-slate-500">선생님께 받은 코드예요. 받은 지 72시간 안에 한 번만 쓸 수 있어요.</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">이름</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="예: 홍길동 어머님" className={field} />
            </label>
          </>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">아이디</span>
          <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" maxLength={20} className={field} />
          {mode === "join" && <span className="mt-1 block text-xs text-slate-500">영어 · 숫자로 4~20자</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">비밀번호</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "join" ? "new-password" : "current-password"} className={field} />
          {mode === "join" && <span className="mt-1 block text-xs text-slate-500">8자 이상</span>}
        </label>
      </fieldset>
      <ErrorText error={error} />
      <button type="submit" disabled={busy} className={`${primary} mt-5 w-full py-3 text-[15px]`}>
        {busy && <Spinner className="h-5 w-5" />}
        {mode === "login" ? "로그인" : "가입하고 시작하기"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- 학부모 화면 (큰 글씨, 단추 2개)

function ParentView({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [tab, setTab] = useState<"messages" | "notices">("messages");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [child, setChild] = useState<string>("");

  useEffect(() => {
    api<{ students: Student[] }>("GET", "/api/board/students").then((r) => {
      setStudents(r.students);
      setChild((c) => c || r.students[0]?.id || "");
    });
  }, []);

  return (
    <div className="text-[17px]">
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(
          [
            ["messages", "알림장", me.unread.messages],
            ["notices", "학급 공지", me.unread.notices],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`rounded-2xl py-4 text-lg font-bold transition ${tab === id ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
          >
            {label}
            <Badge n={n} />
          </button>
        ))}
      </div>
      {tab === "notices" ? (
        <NoticeList me={me} big onChanged={onChanged} />
      ) : students === null ? (
        <div className="grid place-items-center py-10">
          <Spinner className="h-7 w-7 text-indigo-600" />
        </div>
      ) : !students.length ? (
        <p className={`${card} text-center text-slate-500`}>연결된 자녀가 없어요. 선생님께 문의해 주세요.</p>
      ) : (
        <>
          {students.length > 1 && (
            <select value={child} onChange={(e) => setChild(e.target.value)} className={`${field} mb-3 text-[17px]`} aria-label="자녀 고르기">
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {child && <Thread key={child} me={me} student={students.find((s) => s.id === child)!} big onChanged={onChanged} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 교사 · 실무사 · 사회복무요원 화면

type StaffTab = "messages" | "notices" | "memos" | "manage";

function StaffView({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const tabs: [StaffTab, string, number][] =
    me.role === "teacher"
      ? [
          ["messages", "알림장", me.unread.messages + me.unread.drafts],
          ["notices", "학급 공지", 0],
          ["memos", "활동 메모", 0],
          ["manage", "관리", 0],
        ]
      : me.role === "aide"
        ? [
            ["messages", "알림장 초안", 0],
            ["memos", "활동 메모", 0],
          ]
        : [["memos", "활동 메모", 0]];
  const [tab, setTab] = useState<StaffTab>(tabs[0][0]);
  const [students, setStudents] = useState<Student[] | null>(null);
  const reloadStudents = useCallback(() => api<{ students: Student[] }>("GET", "/api/board/students").then((r) => setStudents(r.students)), []);
  useEffect(() => {
    let cancelled = false;
    api<{ students: Student[] }>("GET", "/api/board/students").then((r) => !cancelled && setStudents(r.students));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      {tabs.length > 1 && (
        <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {tabs.map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {label}
              <Badge n={n} />
            </button>
          ))}
        </div>
      )}
      {students === null ? (
        <div className="grid place-items-center py-10">
          <Spinner className="h-7 w-7 text-indigo-600" />
        </div>
      ) : tab === "notices" ? (
        <NoticeList me={me} onChanged={onChanged} />
      ) : tab === "manage" ? (
        <Manage students={students} onStudents={() => void reloadStudents()} />
      ) : !students.length ? (
        <p className={`${card} text-center text-sm text-slate-500`}>
          {me.role === "teacher" ? "「관리」에서 학생을 먼저 더해 주세요." : "아직 등록된 학생이 없어요. 특수교사 선생님께 문의해 주세요."}
        </p>
      ) : (
        <StudentPicker students={students}>{(st) => (tab === "messages" ? <Thread key={st.id} me={me} student={st} onChanged={onChanged} /> : <Memos key={st.id} me={me} student={st} />)}</StudentPicker>
      )}
    </div>
  );
}

/** 학생 목록 → 학생을 누르면 그 학생 화면 */
function StudentPicker({ students, children }: { students: Student[]; children: (s: Student) => ReactNode }) {
  const [pick, setPick] = useState<string | null>(null);
  const st = students.find((s) => s.id === pick);
  if (st)
    return (
      <div>
        <button type="button" onClick={() => setPick(null)} className={`${ghost} mb-3 px-3 py-2`}>
          <ArrowLeftIcon className="h-4 w-4" />
          학생 목록
        </button>
        <h2 className="mb-3 text-lg font-bold text-slate-900">{st.name}</h2>
        {children(st)}
      </div>
    );
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {students.map((s) => (
        <li key={s.id}>
          <button type="button" onClick={() => setPick(s.id)} className="w-full rounded-xl bg-white px-4 py-3.5 text-left text-[15px] font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 transition hover:bg-indigo-50 hover:ring-indigo-200">
            {s.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- 알림장 (학생 한 명의 대화)

function Thread({ me, student, big = false, onChanged }: { me: Me; student: Student; big?: boolean; onChanged: () => void }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Msg | null>(null);

  const load = useCallback(async () => {
    try {
      const { messages } = await api<{ messages: Msg[] }>("GET", `/api/board/messages?student=${student.id}`);
      setMsgs(messages);
      // 열어 본 글은 읽음으로 (학부모는 선생님 글, 교사는 학부모 답글)
      const unread = messages.filter((m) => !m.read && m.status === "sent").map((m) => m.id);
      if (unread.length && me.role !== "aide") {
        await api("PATCH", "/api/board/messages", { action: "read", studentId: student.id, ids: unread });
        onChanged();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
    }
  }, [student.id, me.role, onChanged]);
  useEffect(() => {
    let cancelled = false;
    api<{ messages: Msg[] }>("GET", `/api/board/messages?student=${student.id}`)
      .then(async ({ messages }) => {
        if (cancelled) return;
        setMsgs(messages);
        const unread = messages.filter((m) => !m.read && m.status === "sent").map((m) => m.id);
        if (unread.length && me.role !== "aide") {
          await api("PATCH", "/api/board/messages", { action: "read", studentId: student.id, ids: unread });
          onChanged();
        }
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "불러오지 못했어요."));
    return () => {
      cancelled = true;
    };
  }, [student.id, me.role, onChanged]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/board/messages", { studentId: student.id, body: text });
      setText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "보내지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const placeholder = me.role === "parent" ? "선생님께 답글 쓰기" : me.role === "aide" ? "알림장 초안 (특수교사 선생님이 확인한 뒤 학부모님께 보내져요)" : "학부모님께 보낼 알림장";

  return (
    <div className={card}>
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => void load()} className={`${ghost} px-3 py-1.5 text-xs`} aria-label="새로고침">
          <RefreshIcon className="h-3.5 w-3.5" />
          새로고침
        </button>
      </div>
      {msgs === null ? (
        <div className="grid place-items-center py-8">
          <Spinner className="h-6 w-6 text-indigo-600" />
        </div>
      ) : !msgs.length ? (
        <p className="py-8 text-center text-slate-500">아직 주고받은 알림장이 없어요.</p>
      ) : (
        <ul className="space-y-3">
          {msgs.map((m) => (
            <MessageItem key={m.id} m={m} me={me} big={big} onRemove={() => setRemoving(m)} onApproved={() => void load().then(onChanged)} />
          ))}
        </ul>
      )}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={big ? 3 : 4} maxLength={5000} placeholder={placeholder} className={`${field} resize-y ${big ? "text-[17px]" : ""}`} />
        <ErrorText error={error} />
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} className={`${primary} ${big ? "px-6 py-3 text-base" : ""}`}>
            {busy && <Spinner className="h-4 w-4" />}
            {me.role === "parent" ? "답글 보내기" : me.role === "aide" ? "초안 올리기" : "보내기"}
          </button>
        </div>
      </div>
      {removing && (
        <ConfirmDialog
          title="이 글을 지울까요?"
          confirmLabel="지우기"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const id = removing.id;
            setRemoving(null);
            void api("DELETE", `/api/board/messages?id=${id}`).then(load, (e: Error) => setError(e.message));
          }}
        >
          지우면 학부모님 화면에서도 사라지고 되돌릴 수 없어요.
        </ConfirmDialog>
      )}
    </div>
  );
}

function MessageItem({ m, me, big, onRemove, onApproved }: { m: Msg; me: Me; big: boolean; onRemove: () => void; onApproved: () => void }) {
  const mine = m.by === me.userId || (me.role === "teacher" && m.byRole === "teacher");
  const fromParent = m.kind === "reply";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("PATCH", "/api/board/messages", { action: "approve", id: m.id, body: draft });
      onApproved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "보내지 못했어요.");
      setBusy(false);
    }
  };

  return (
    <li className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${m.status === "draft" ? "bg-amber-50 ring-1 ring-amber-200" : fromParent ? "bg-emerald-50" : mine ? "bg-indigo-50" : "bg-slate-100"}`}>
        <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs font-semibold text-slate-500">
          <span className="text-slate-700">{m.byName}</span>
          <span>{fmt(m.at)}</span>
          {m.status === "draft" && <span className="rounded bg-amber-200 px-1.5 py-px text-amber-900">초안 · 아직 안 보냄</span>}
          {me.role === "teacher" && m.kind === "note" && m.status === "sent" && <span className="text-emerald-600">{m.readers?.length ? "✓ 학부모 읽음" : "안 읽음"}</span>}
        </p>
        {editing ? (
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} className={`${field} resize-y`} />
        ) : (
          <p className={`whitespace-pre-wrap break-words text-slate-800 ${big ? "text-[17px] leading-relaxed" : "text-[15px]"}`}>{m.body}</p>
        )}
        <ErrorText error={error} />
        {me.role === "teacher" && (
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            {m.status === "draft" &&
              (editing ? (
                <button type="button" onClick={() => void approve()} disabled={busy || !draft.trim()} className={`${primary} px-3 py-1.5 text-xs`}>
                  {busy && <Spinner className="h-3.5 w-3.5" />}이대로 보내기
                </button>
              ) : (
                <button type="button" onClick={() => setEditing(true)} className={`${primary} px-3 py-1.5 text-xs`}>
                  확인 · 고쳐서 보내기
                </button>
              ))}
            <button type="button" onClick={onRemove} aria-label="글 지우기" className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- 학급 공지

function NoticeList({ me, big = false, onChanged }: { me: Me; big?: boolean; onChanged: () => void }) {
  const [list, setList] = useState<Notice[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    const { notices } = await api<{ notices: Notice[] }>("GET", "/api/board/notices");
    setList(notices);
    return notices;
  }, []);
  useEffect(() => {
    let cancelled = false;
    api<{ notices: Notice[] }>("GET", "/api/board/notices")
      .then(async ({ notices }) => {
        if (cancelled) return;
        setList(notices);
        // 학부모가 공지 목록을 열면 읽음으로
        const unread = me.role === "parent" ? notices.filter((n) => !n.read) : [];
        if (unread.length) {
          await Promise.all(unread.map((n) => api("PATCH", "/api/board/notices", { id: n.id })));
          onChanged();
        }
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "불러오지 못했어요."));
    return () => {
      cancelled = true;
    };
  }, [me.role, onChanged]);

  const post = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/board/notices", { title, body });
      setTitle("");
      setBody("");
      setWriting(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {me.role === "teacher" &&
        (writing ? (
          <div className={card}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="제목" className={field} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={5000} placeholder="모든 학부모님께 보낼 공지 내용" className={`${field} mt-2 resize-y`} />
            <ErrorText error={error} />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setWriting(false)} className={ghost}>
                취소
              </button>
              <button type="button" onClick={() => void post()} disabled={busy || !title.trim() || !body.trim()} className={primary}>
                {busy && <Spinner className="h-4 w-4" />}
                공지 올리기
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setWriting(true)} className={`${primary} w-full`}>
            <PlusIcon className="h-4 w-4" />새 공지 쓰기
          </button>
        ))}
      {!writing && <ErrorText error={error} />}
      {list === null ? (
        <div className="grid place-items-center py-10">
          <Spinner className="h-7 w-7 text-indigo-600" />
        </div>
      ) : !list.length ? (
        <p className={`${card} text-center text-slate-500`}>아직 공지가 없어요.</p>
      ) : (
        list.map((n) => (
          <article key={n.id} className={card}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className={`font-bold text-slate-900 ${big ? "text-lg" : "text-[15px]"}`}>
                  {!n.read && me.role === "parent" && <span className="mr-1.5 rounded bg-rose-500 px-1.5 py-px align-middle text-[11px] text-white">새 글</span>}
                  {n.title}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {n.byName} · {fmt(n.at)}
                  {n.readers && <span className="ml-2 font-semibold text-emerald-600">{n.readers.length}명 읽음</span>}
                </p>
              </div>
              {me.role === "teacher" && (
                <button type="button" onClick={() => setRemoving(n)} aria-label="공지 지우기" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className={`mt-3 whitespace-pre-wrap break-words text-slate-800 ${big ? "text-[17px] leading-relaxed" : "text-[15px]"}`}>{n.body}</p>
          </article>
        ))
      )}
      {removing && (
        <ConfirmDialog
          title="이 공지를 지울까요?"
          confirmLabel="지우기"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const id = removing.id;
            setRemoving(null);
            void api("DELETE", `/api/board/notices?id=${id}`).then(load, (e: Error) => setError(e.message));
          }}
        >
          지우면 학부모님 화면에서도 사라지고 되돌릴 수 없어요.
        </ConfirmDialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 활동 메모

function Memos({ me, student }: { me: Me; student: Student }) {
  const [list, setList] = useState<Memo[] | null>(null);
  const [date, setDate] = useState(todayStr);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<{ memos: Memo[] }>("GET", `/api/board/memos?student=${student.id}`).then((r) => setList(r.memos)), [student.id]);
  useEffect(() => {
    let cancelled = false;
    api<{ memos: Memo[] }>("GET", `/api/board/memos?student=${student.id}`)
      .then((r) => !cancelled && setList(r.memos))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "불러오지 못했어요."));
    return () => {
      cancelled = true;
    };
  }, [student.id]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/board/memos", { studentId: student.id, date, body: text });
      setText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "남기지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} w-auto`} aria-label="날짜" />
          <span className="text-xs text-slate-500">{me.role === "sw" ? "남긴 메모는 선생님들이 볼 수 있어요." : "학부모님께는 보이지 않아요."}</span>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="예: 점심을 다 먹고 친구에게 먼저 인사함" className={`${field} mt-2 resize-y`} />
        <ErrorText error={error} />
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={() => void add()} disabled={busy || !text.trim()} className={primary}>
            {busy && <Spinner className="h-4 w-4" />}
            메모 남기기
          </button>
        </div>
      </div>
      {list === null ? (
        <div className="grid place-items-center py-8">
          <Spinner className="h-6 w-6 text-indigo-600" />
        </div>
      ) : !list.length ? (
        <p className="py-6 text-center text-sm text-slate-500">아직 남긴 메모가 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => (
            <li key={m.id} className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="text-slate-700">{m.date}</span>
                <span>
                  {m.byName} ({ROLE_LABEL[m.byRole]})
                </span>
                {me.role === "teacher" && (
                  <button
                    type="button"
                    onClick={() => void api("DELETE", `/api/board/memos?student=${student.id}&id=${m.id}`).then(load, (e: Error) => setError(e.message))}
                    aria-label="메모 지우기"
                    className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[15px] text-slate-800">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 관리 (교사): 학생 · 초대 코드 · 계정 · 감사 기록 · 내보내기

function Manage({ students, onStudents }: { students: Student[]; onStudents: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"parent" | "aide" | "sw">("parent");
  const [kids, setKids] = useState<string[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [users, setUsers] = useState<User[] | null>(null);
  const [auditDate, setAuditDate] = useState(todayStr);
  const [audit, setAudit] = useState<{ at: number; by: string; role: string; action: string; target: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; text: string; run: () => Promise<unknown> } | null>(null);

  const loadUsers = useCallback(() => api<{ users: User[] }>("GET", "/api/board/users").then((r) => setUsers(r.users)), []);
  useEffect(() => {
    let cancelled = false;
    api<{ users: User[] }>("GET", "/api/board/users").then((r) => !cancelled && setUsers(r.users));
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (job: () => Promise<unknown>) => {
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    }
  };
  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? "(지운 학생)";
  const userName = (id: string) => (id === "teacher" || id === "admin" ? "특수교사" : (users?.find((u) => u.id === id)?.name ?? id));

  return (
    <div className="space-y-4">
      <ErrorText error={error} />

      <section className={card}>
        <h2 className="font-bold text-slate-900">학생</h2>
        <p className="mt-0.5 text-xs text-slate-500">이름은 암호화해서 서버에 저장해요. 학생을 지우면 그 학생의 알림장 · 메모도 모두 지워져요.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("POST", "/api/board/students", { name });
              setName("");
              onStudents();
            });
          }}
          className="mt-3 flex gap-2"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="예: 1-3 홍길동" className={field} />
          <button type="submit" disabled={!name.trim()} className={`${primary} shrink-0`}>
            더하기
          </button>
        </form>
        <ul className="mt-3 flex flex-wrap gap-2">
          {students.map((s) => (
            <li key={s.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm font-medium text-slate-700">
              {s.name}
              <button
                type="button"
                aria-label={`${s.name} 지우기`}
                onClick={() => setConfirm({ title: `${s.name} 학생을 지울까요?`, text: "이 학생의 알림장 · 활동 메모가 모두 지워지고 되돌릴 수 없어요.", run: () => api("DELETE", `/api/board/students?id=${s.id}`).then(onStudents) })}
                className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="font-bold text-slate-900">초대 코드 만들기</h2>
        <p className="mt-0.5 text-xs text-slate-500">코드는 72시간 동안 한 번만 쓸 수 있어요. 받은 사람이 「초대 코드로 가입」에서 직접 아이디 · 비밀번호를 만들어요.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["parent", "aide", "sw"] as const).map((r) => (
            <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${role === r ? "bg-indigo-600 text-white ring-indigo-600" : "text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        {role === "parent" && (
          <fieldset className="mt-3">
            <legend className="mb-1.5 text-xs font-semibold text-slate-600">자녀 (학부모님은 고른 학생의 알림장만 볼 수 있어요)</legend>
            <div className="flex flex-wrap gap-2">
              {students.map((s) => {
                const on = kids.includes(s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={on} onClick={() => setKids((k) => (on ? k.filter((x) => x !== s.id) : [...k, s.id]))} className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${on ? "bg-emerald-600 text-white ring-emerald-600" : "text-slate-600 ring-slate-200"}`}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        <button
          type="button"
          disabled={role === "parent" && !kids.length}
          onClick={() =>
            void run(async () => {
              const r = await api<{ code: string }>("POST", "/api/board/invites", { role, studentIds: role === "parent" ? kids : [] });
              setCode(r.code);
            })
          }
          className={`${primary} mt-3`}
        >
          코드 만들기
        </button>
        {code && (
          <div className="mt-3 rounded-xl bg-indigo-50 p-4 text-center">
            <p className="text-xs font-semibold text-indigo-700">{ROLE_LABEL[role]} 초대 코드 (지금만 보여요)</p>
            <p className="mt-1 select-all font-mono text-2xl font-bold tracking-widest text-indigo-900">{code}</p>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(code)} className={`${ghost} mt-2 bg-white px-3 py-1.5 text-xs`}>
              복사
            </button>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="font-bold text-slate-900">가입한 계정</h2>
        {users === null ? (
          <Spinner className="mt-3 h-5 w-5 text-indigo-600" />
        ) : !users.length ? (
          <p className="mt-2 text-sm text-slate-500">아직 가입한 사람이 없어요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-800">{u.name}</span> <span className="text-slate-500">({ROLE_LABEL[u.role]} · {u.loginId})</span>
                  {u.studentIds.length > 0 && <span className="block text-xs text-slate-500">자녀: {u.studentIds.map(studentName).join(", ")}</span>}
                </span>
                <button
                  type="button"
                  aria-label={`${u.name} 계정 지우기`}
                  onClick={() => setConfirm({ title: `${u.name} 계정을 지울까요?`, text: "이 계정으로 더는 로그인할 수 없어요. 쓴 글은 남아요.", run: () => api("DELETE", `/api/board/users?id=${u.id}`).then(loadUsers) })}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-bold text-slate-900">감사 기록</h2>
        <p className="mt-0.5 text-xs text-slate-500">누가 언제 어느 학생의 글을 보거나 쓰거나 지웠는지 남아요 (글 내용은 남기지 않아요).</p>
        <div className="mt-3 flex gap-2">
          <input type="date" value={auditDate} onChange={(e) => setAuditDate(e.target.value)} className={`${field} w-auto`} aria-label="날짜" />
          <button type="button" onClick={() => void run(async () => setAudit((await api<{ rows: NonNullable<typeof audit> }>("GET", `/api/board/audit?date=${auditDate}`)).rows))} className={ghost}>
            보기
          </button>
        </div>
        {audit && (
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-xs text-slate-600">
            {!audit.length && <li>기록이 없어요.</li>}
            {audit.map((r, i) => (
              <li key={i} className="tabular-nums">
                {new Date(r.at).toLocaleTimeString("ko-KR")} · {userName(r.by)} · {r.action}
                {r.target && students.some((s) => s.id === r.target) ? ` · ${studentName(r.target)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-bold text-slate-900">내보내기</h2>
        <p className="mt-0.5 text-xs text-slate-500">모든 공지 · 알림장 · 활동 메모를 JSON 파일로 내려받아요. 글은 지우기 전까지 계속 보관돼요.</p>
        <a href="/api/board/export" className={`${ghost} mt-3`}>
          JSON 내려받기
        </a>
      </section>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel="지우기"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const job = confirm.run;
            setConfirm(null);
            void run(job);
          }}
        >
          {confirm.text}
        </ConfirmDialog>
      )}
    </div>
  );
}
