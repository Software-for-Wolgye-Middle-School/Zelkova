"use client";

import { MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { login, logout } from "./auth";
import ConfirmDialog from "./ConfirmDialog";
import { ArrowRightIcon, Spinner, TrashIcon } from "./icons";
import RevealText from "./smoothui/reveal-text";
import ZelkovaScene from "./ZelkovaScene";

/**
 * 계정 화면들: 첫 화면(서비스 시작하기) · 카카오 · 구글 · 네이버 로그인 · 처음 가입(이름 · 직급) · 승인 대기 ·
 * 오른쪽 위 프로필 메뉴 · 회원 관리(승인). 로그인 확인은 모두 서버(/api/auth, /api/oauth, /api/account)에서 함.
 */

export type AccountRole = "user" | "admin" | "teacher" | "aide" | "sw" | "parent" | "pending";
export type Account = { authed: boolean; admin: boolean; board: string | null; role: AccountRole | null; name: string; signup: boolean; providers: string[] };

export const ROLE_LABEL: Record<AccountRole, string> = {
  user: "공용 계정",
  admin: "관리자",
  teacher: "특수학급교사",
  aide: "특수학급실무사",
  sw: "사회복무요원",
  parent: "학부모",
  pending: "승인 대기",
};

export async function fetchAccount(): Promise<Account | null> {
  try {
    const res = await fetch("/api/auth", { cache: "no-store" });
    return res.ok ? ((await res.json()) as Account) : null;
  } catch {
    return null;
  }
}

/** 화면 뒤 느티나무 배경과 가운데 내용 */
function Scene({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <section className="relative isolate flex flex-1 flex-col overflow-hidden">
        <ZelkovaScene className="absolute inset-0 -z-10 h-full w-full" />
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 pb-10 pt-10 sm:pt-14">{children}</div>
      </section>
    </MotionConfig>
  );
}

const Title = () => (
  <h1 className="text-center text-4xl font-extrabold tracking-tight text-slate-900 [text-shadow:0_1px_18px_rgba(255,255,255,0.9)] sm:text-6xl">
    <RevealText className="bg-gradient-to-br from-emerald-600 to-green-800 bg-clip-text text-transparent [text-shadow:none]">느티나무</RevealText> <RevealText delay={90}>교실</RevealText>{" "}
    <RevealText delay={180}>도우미</RevealText>
  </h1>
);

// ---------------------------------------------------------------- 첫 화면

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <Scene>
      <Title />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }} className="mt-auto w-full max-w-sm pb-6 sm:mb-10">
        <button
          type="button"
          onClick={onStart}
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-lg font-bold text-white shadow-xl shadow-indigo-600/30 transition hover:brightness-110"
        >
          서비스 시작하기
          <ArrowRightIcon className="h-5 w-5 transition group-hover:translate-x-0.5" />
        </button>
      </motion.div>
    </Scene>
  );
}

// ---------------------------------------------------------------- 로그인 (카카오 · 구글 · 네이버)

const LOGIN_ERRORS: Record<string, string> = {
  state: "로그인 확인에 실패했어요. 다시 시도해 주세요.",
  provider: "로그인 서비스에서 정보를 받지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  kakao_not_configured: "카카오 로그인은 아직 준비 중이에요. (관리자: KAKAO_CLIENT_ID 설정 필요)",
  google_not_configured: "구글 로그인은 아직 준비 중이에요. (관리자: GOOGLE_CLIENT_ID · SECRET 설정 필요)",
  naver_not_configured: "네이버 로그인은 아직 준비 중이에요. (관리자: NAVER_CLIENT_ID · SECRET 설정 필요)",
};

const KakaoIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path fill="#191919" d="M12 3C6.48 3 2 6.58 2 11c0 2.85 1.86 5.35 4.67 6.77l-.95 3.5c-.08.3.26.54.52.37l4.15-2.74c.53.06 1.07.1 1.61.1 5.52 0 10-3.58 10-8S17.52 3 12 3Z" />
  </svg>
);
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38Z" />
  </svg>
);
const NaverIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <path fill="#fff" d="M16.27 3v9.36L7.73 3H3v18h4.73v-9.36L16.27 21H21V3h-4.73Z" />
  </svg>
);

export function LoginScreen({ error, onIdLogin, onBack }: { error: string | null; onIdLogin: () => void; onBack: () => void }) {
  const [showId, setShowId] = useState(false);
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(error ? (LOGIN_ERRORS[error] ?? "로그인하지 못했어요.") : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !password) return setMsg("아이디와 비밀번호를 입력해 주세요.");
    setBusy(true);
    setMsg(null);
    const r = await login(id.trim(), password);
    if (r.ok) onIdLogin();
    else {
      setMsg(r.error);
      setPassword("");
      setBusy(false);
    }
  };

  const social = "relative flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3.5 text-[15px] font-semibold shadow-sm transition hover:brightness-[0.97]";
  return (
    <Scene>
      <div className="fade-up w-full max-w-sm rounded-3xl bg-white/90 p-6 shadow-xl shadow-emerald-950/10 ring-1 ring-white backdrop-blur-md sm:p-8">
        <h1 className="text-center text-3xl font-extrabold tracking-tight text-slate-900">로그인</h1>

        <div className="mt-8 space-y-3">
          <a href="/api/oauth/kakao/start" className={`${social} bg-[#FEE500] text-[#191919]`}>
            <span className="absolute -top-3 left-5 rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-bold text-white shadow">간편 로그인</span>
            <KakaoIcon />
            카카오 계정으로 로그인
          </a>
          <a href="/api/oauth/google/start" className={`${social} bg-white text-slate-800 ring-1 ring-slate-200`}>
            <GoogleIcon />
            구글 계정으로 로그인
          </a>
          <a href="/api/oauth/naver/start" className={`${social} bg-[#03C75A] text-white`}>
            <NaverIcon />
            네이버 계정으로 로그인
          </a>
        </div>

        {msg && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {msg}
          </p>
        )}

        {showId ? (
          <form onSubmit={submit} className="mt-6 space-y-2 border-t border-slate-100 pt-5">
            <fieldset disabled={busy} className="space-y-2">
              <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" placeholder="아이디" aria-label="아이디" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="비밀번호" aria-label="비밀번호" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
            </fieldset>
            <button type="submit" disabled={busy} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[15px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
              {busy && <Spinner className="h-4 w-4" />}
              로그인
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setShowId(true)} className="mx-auto mt-6 block text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline">
            아이디로 로그인
          </button>
        )}
        <button type="button" onClick={onBack} className="mx-auto mt-3 block text-xs font-medium text-slate-400 hover:text-slate-600">
          ‹ 처음 화면으로
        </button>
      </div>
    </Scene>
  );
}

// ---------------------------------------------------------------- 처음 가입: 이름 · 직급

const SIGNUP_ROLES: [string, string][] = [
  ["sw", "사회복무요원"],
  ["teacher", "특수학급교사"],
  ["aide", "특수학급실무사"],
  ["parent", "학부모"],
];

export function SignupScreen({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("이름을 적어 주세요.");
    if (!role) return setError("직급을 골라 주세요.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, role }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "가입하지 못했어요.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입하지 못했어요.");
      setBusy(false);
    }
  };

  return (
    <Scene>
      <form onSubmit={submit} className="fade-up w-full max-w-sm rounded-3xl bg-white/90 p-6 shadow-xl shadow-emerald-950/10 ring-1 ring-white backdrop-blur-md sm:p-8">
        <h1 className="text-center text-2xl font-extrabold tracking-tight text-slate-900">회원가입</h1>
        <p className="mt-1 text-center text-sm text-slate-500">처음 오셨네요! 이름과 직급을 알려 주세요.</p>
        <fieldset disabled={busy} className="mt-6 space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">이름</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus placeholder="예: 김민지" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
          </label>
          <div role="radiogroup" aria-label="직급">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">직급</span>
            <div className="grid grid-cols-2 gap-2">
              {SIGNUP_ROLES.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={role === id}
                  onClick={() => setRole(id)}
                  className={`rounded-xl px-3 py-3 text-sm font-semibold ring-1 ring-inset transition ${role === id ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-bold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:opacity-60">
          {busy && <Spinner className="h-4 w-4" />}
          가입 신청하기
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">관리자가 승인하면 바로 쓸 수 있어요.</p>
        <button type="button" onClick={onCancel} className="mx-auto mt-3 block text-xs font-medium text-slate-400 hover:text-slate-600">
          취소
        </button>
      </form>
    </Scene>
  );
}

// ---------------------------------------------------------------- 승인 대기

export function PendingScreen({ name, onCheck, onLogout }: { name: string; onCheck: () => Promise<void>; onLogout: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Scene>
      <div className="fade-up w-full max-w-sm rounded-3xl bg-white/90 p-7 text-center shadow-xl shadow-emerald-950/10 ring-1 ring-white backdrop-blur-md">
        <p className="text-4xl" aria-hidden="true">
          🌱
        </p>
        <h1 className="mt-3 text-xl font-extrabold text-slate-900">{name} 님, 가입 신청을 받았어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">관리자가 승인하면 바로 쓸 수 있어요. 승인되면 아래 단추를 눌러 주세요.</p>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onCheck();
            setBusy(false);
          }}
          className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy && <Spinner className="h-4 w-4" />}
          승인됐는지 확인하기
        </button>
        <button type="button" onClick={onLogout} className="mt-3 text-xs font-medium text-slate-400 hover:text-slate-600">
          로그아웃
        </button>
      </div>
    </Scene>
  );
}

// ---------------------------------------------------------------- 오른쪽 위 프로필

export function ProfileMenu({ account, onLogout, onMembers }: { account: Account; onLogout: () => void; onMembers: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const role = account.role ?? "user";
  const canManage = role === "admin" || role === "teacher";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${account.name} 프로필`}
        className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-indigo-600 text-sm font-bold text-white shadow-sm ring-2 ring-white transition hover:brightness-110"
      >
        {[...account.name][0] ?? "?"}
      </button>
      {open && (
        <div role="menu" className="fade-up absolute right-0 top-full z-50 mt-2 w-60 rounded-xl bg-white p-2 shadow-xl ring-1 ring-slate-200">
          <div className="px-3 py-2">
            <p className="truncate text-[15px] font-bold text-slate-900">{account.name}</p>
            <p className="text-xs font-medium text-slate-500">{ROLE_LABEL[role]}</p>
          </div>
          <div className="my-1 h-px bg-slate-100" />
          {canManage && (
            <button type="button" role="menuitem" onClick={() => (setOpen(false), onMembers())} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50">
              회원 관리 · 가입 승인
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onLogout())} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50">
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

export const doLogout = logout;

// ---------------------------------------------------------------- 회원 관리 (관리자 · 특수교사)

type Member = { id: string; role: Exclude<AccountRole, "user" | "admin" | "pending">; status?: "pending" | "active"; requestedRole?: string; name: string; loginId?: string; studentIds: string[]; createdAt: number; oauth?: string[] };
type Student = { id: string; name: string };
const MEMBER_ROLES: [Member["role"], string][] = [
  ["teacher", "특수학급교사"],
  ["aide", "특수학급실무사"],
  ["sw", "사회복무요원"],
  ["parent", "학부모"],
];

export function MembersApp() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([fetch("/api/account/members", { cache: "no-store" }), fetch("/api/board/students", { cache: "no-store" })]);
      const md = (await m.json()) as { users?: Member[]; error?: string };
      if (!m.ok) throw new Error(md.error ?? "불러오지 못했어요.");
      setMembers(md.users ?? []);
      if (s.ok) setStudents(((await s.json()) as { students: Student[] }).students);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const save = async (id: string, role: string, studentIds: string[]) => {
    setError(null);
    const res = await fetch("/api/account/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, role, studentIds }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setError(data.error ?? "저장하지 못했어요.");
    await load();
  };

  const pending = members?.filter((m) => m.status === "pending") ?? [];
  const active = members?.filter((m) => m.status !== "pending") ?? [];

  return (
    <div className="fade-up mx-auto max-w-3xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">회원 관리</h1>
        <p className="mt-1.5 text-sm text-slate-500">카카오 · 구글 · 네이버로 가입한 사람을 승인하고 직급을 정해요. 학부모는 자녀를 연결해야 해요.</p>
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {members === null ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-8 w-8 text-indigo-600" />
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-bold text-slate-700">
              승인 대기 <span className="text-rose-600">{pending.length}</span>
            </h2>
            {!pending.length ? (
              <p className="rounded-xl bg-white p-5 text-center text-sm text-slate-500 ring-1 ring-slate-200">기다리는 사람이 없어요.</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((m) => (
                  <MemberRow key={m.id} m={m} students={students} onSave={save} onRemove={() => setRemoving(m)} pending />
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-2 text-sm font-bold text-slate-700">가입한 사람 {active.length}</h2>
            {!active.length ? (
              <p className="rounded-xl bg-white p-5 text-center text-sm text-slate-500 ring-1 ring-slate-200">아직 없어요.</p>
            ) : (
              <ul className="space-y-2">
                {active.map((m) => (
                  <MemberRow key={m.id} m={m} students={students} onSave={save} onRemove={() => setRemoving(m)} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title={removing.status === "pending" ? `${removing.name} 님의 가입을 거절할까요?` : `${removing.name} 님의 계정을 지울까요?`}
          confirmLabel={removing.status === "pending" ? "거절하기" : "지우기"}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const id = removing.id;
            setRemoving(null);
            void fetch(`/api/account/members?id=${id}`, { method: "DELETE" }).then(load);
          }}
        >
          이 계정으로 더는 로그인할 수 없어요. 다시 쓰려면 새로 가입해야 해요.
        </ConfirmDialog>
      )}
    </div>
  );
}

function MemberRow({ m, students, onSave, onRemove, pending = false }: { m: Member; students: Student[]; onSave: (id: string, role: string, kids: string[]) => Promise<unknown>; onRemove: () => void; pending?: boolean }) {
  const [role, setRole] = useState<string>(m.requestedRole && pending ? m.requestedRole : m.role);
  const [kids, setKids] = useState<string[]>(m.studentIds);
  const [busy, setBusy] = useState(false);
  const changed = pending || role !== m.role || kids.join() !== m.studentIds.join();
  const via = m.oauth?.[0]?.split(":")[3] ?? (m.loginId ? "아이디" : "");
  return (
    <li className={`rounded-xl bg-white p-4 ring-1 ${pending ? "ring-amber-200" : "ring-slate-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-bold text-slate-900">{m.name}</span>
        <span className="text-xs text-slate-500">
          {via === "kakao" ? "카카오" : via === "google" ? "구글" : via === "naver" ? "네이버" : via}
          {pending && m.requestedRole ? ` · 신청 직급: ${MEMBER_ROLES.find(([r]) => r === m.requestedRole)?.[1]}` : ""} · {new Date(m.createdAt).toLocaleDateString("ko-KR")}
        </span>
        <button type="button" onClick={onRemove} aria-label={pending ? "가입 거절" : "계정 지우기"} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {MEMBER_ROLES.map(([r, label]) => (
          <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)} className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${role === r ? "bg-indigo-600 text-white ring-indigo-600" : "text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
            {label}
          </button>
        ))}
      </div>
      {role === "parent" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="w-full text-xs font-semibold text-slate-500">자녀 {students.length ? "" : "(소통게시판 「관리」에서 학생을 먼저 더해 주세요)"}</span>
          {students.map((s) => {
            const on = kids.includes(s.id);
            return (
              <button key={s.id} type="button" aria-pressed={on} onClick={() => setKids((k) => (on ? k.filter((x) => x !== s.id) : [...k, s.id]))} className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${on ? "bg-emerald-600 text-white ring-emerald-600" : "text-slate-600 ring-slate-200"}`}>
                {s.name}
              </button>
            );
          })}
        </div>
      )}
      {changed && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={busy || (role === "parent" && !kids.length)}
            onClick={async () => {
              setBusy(true);
              await onSave(m.id, role, role === "parent" ? kids : []);
              setBusy(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy && <Spinner className="h-4 w-4" />}
            {pending ? "승인하기" : "저장"}
          </button>
        </div>
      )}
    </li>
  );
}
