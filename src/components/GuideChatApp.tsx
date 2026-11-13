"use client";

import { useEffect, useRef, useState } from "react";
import { checkAdmin } from "./auth";
import { ArrowRightIcon, PencilIcon, SparkleIcon, Spinner } from "./icons";
import LoginOverlay from "./LoginOverlay";

type Msg = { role: "user" | "model"; text: string };

/** 처음 화면에 보여 주는 질문 예시 (누르면 바로 물어봄) */
const SUGGESTIONS = ["첫 출근인데 업무에 대해서 설명해주세요", "느티나무반 학생들에 대해서 알려 주세요", "학생이 갑자기 사라지거나 돌발 상황이 일어나면 어떻게 하나요?"];

/** 마크다운 링크 [보여 줄 글](주소) 또는 그냥 인터넷 주소 (끝의 문장부호 · 괄호는 빼고) */
const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,!?])/g;

/** 주소만 있을 때 주소 대신 보여 줄 글 */
const linkLabel = (url: string) => (/youtube\.com|youtu\.be/.test(url) ? "유튜브 채널 보러 가기" : "링크 열어 보기");

/** 낱말 하나가 나타나는 간격 (ms) */
const WORD_MS = 28;

/**
 * Gemini 답을 보여 줌: 마크다운 굵은 글씨(**…**)는 굵게, 목록 표시(* )는 •로.
 * animate 이면 낱말이 왼쪽부터 차례로 흐릿하게 나타남 (처음 그려질 때 한 번만)
 */
function Rich({ text, animate }: { text: string; animate: boolean }) {
  let n = 0;
  const words = (s: string) =>
    s.split(/(\s+)/).map((w, i) =>
      !w || /^\s+$/.test(w) || !animate ? (
        w
      ) : (
        <span key={i} className="word-in" style={{ animationDelay: `${n++ * WORD_MS}ms` }}>
          {w}
        </span>
      ),
    );
  /** 글 속 링크는 주소를 보이지 않고 글에 넣어, 누르면 새 탭으로 열리게 */
  const linked = (s: string) => {
    const out: React.ReactNode[] = [];
    let last = 0;
    for (const m of s.matchAll(LINK_RE)) {
      const at = m.index ?? 0;
      if (at > last) out.push(<span key={`t${at}`}>{words(s.slice(last, at))}</span>);
      const url = m[2] ?? m[3];
      out.push(
        <a key={`a${at}`} href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800">
          {m[1] ?? linkLabel(url)} ↗
        </a>,
      );
      last = at + m[0].length;
    }
    if (last < s.length) out.push(<span key={`t${last}`}>{words(s.slice(last))}</span>);
    return out;
  };
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <b key={i}>{linked(part.slice(2, -2))}</b> : <span key={i}>{linked(part.replace(/^([ \t]*)[*-][ \t]+/gm, "$1• "))}</span>,
      )}
    </>
  );
}

/** 사회복무요원 업무 안내: 학교 업무와 등록된 학생에 대해 Gemini 와 채팅으로 묻고 답함 */
export default function GuideChatApp() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 방금 받은 답 (이 답만 낱말이 차례로 나타남) */
  const [animIndex, setAnimIndex] = useState(-1);
  /** 업무 안내(인수인계) 글을 고치는 중 */
  const [editing, setEditing] = useState(false);
  /** 업무 안내 편집은 관리자만: 관리자가 아니면 관리자 로그인 창을 띄움 */
  const [adminLogin, setAdminLogin] = useState(false);
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const openEditor = async () => {
    setAdminMsg(null);
    if (await checkAdmin()) setEditing(true);
    else setAdminLogin(true);
  };
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", text: q }];
    setMessages(next);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/guide/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok || !data?.text) throw new Error(data?.error ?? "답을 받지 못했어요. 잠시 뒤 다시 해 주세요.");
      setAnimIndex(next.length);
      setMessages((m) => [...m, { role: "model", text: data.text! }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "답을 받지 못했어요.");
      // 보내지 못한 질문은 입력칸으로 돌려놓음
      setMessages((m) => m.slice(0, -1));
      setInput(q);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fade-up mx-auto flex max-w-3xl flex-col">
      <div className="relative mb-5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">사회복무요원 업무 안내</h1>
        <p className="mt-1 text-sm text-slate-500">{editing ? "챗봇이 참고할 인수인계 내용과 학생 소개를 적어 주세요." : "학교 업무나 우리 반 학생에 대해 궁금한 걸 물어보세요."}</p>
        {!editing && (
          <button
            type="button"
            onClick={() => void openEditor()}
            className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 sm:absolute sm:right-0 sm:top-1 sm:mt-0"
          >
            <PencilIcon className="h-4 w-4" />
            업무 안내 편집
          </button>
        )}
      </div>

      {adminMsg && (
        <p role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-800">
          {adminMsg}
        </p>
      )}
      {adminLogin && (
        <LoginOverlay
          title="관리자 로그인"
          exitLabel="닫기"
          onExit={() => setAdminLogin(false)}
          onSuccess={async () => {
            setAdminLogin(false);
            if (await checkAdmin()) setEditing(true);
            else setAdminMsg("업무 안내 편집은 관리자 계정으로만 할 수 있어요.");
          }}
        />
      )}

      {editing ? (
        <GuideEditor onClose={() => setEditing(false)} />
      ) : (
        <>

      <div className="flex h-[min(70vh,40rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-indigo-600/30">
                <SparkleIcon className="h-7 w-7" />
              </span>
              <p className="text-[15px] font-semibold text-slate-700">안녕하세요! 무엇이든 물어보세요.</p>
              <p className="text-sm text-slate-500">아래 예시 질문을 눌러도 바로 물어볼 수 있어요.</p>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-[15px] text-white">{m.text}</p>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2.5">
                <span aria-hidden="true" className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
                  <SparkleIcon className="h-4 w-4" />
                </span>
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-slate-100 px-4 py-2.5 text-[15px] leading-relaxed text-slate-800">
                  <Rich text={m.text} animate={i === animIndex} />
                </p>
              </div>
            ),
          )}

          {busy && (
            <div className="flex items-center gap-2.5 text-sm text-slate-500">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
                <Spinner className="h-4 w-4" />
              </span>
              답을 생각하는 중…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-600">
            {error}
          </p>
        )}

        {/* 아래쪽(예시 질문 · 입력칸)에 마우스를 대면 예시 질문이 멈춤 */}
        <div className="chat-bottom">
        {/* 예시 질문: 왼쪽에서 오른쪽으로 계속 흘러가고, 누르면 바로 물어봄 */}
        <div className="marquee relative overflow-hidden border-t border-slate-100 py-2.5 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
          <div className="marquee-track flex w-max">
            {/* 끊김 없이 이어지도록 같은 목록을 두 번 (두 번째는 화면 읽기에서 숨김) */}
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 gap-2 pr-2" aria-hidden={copy === 1 || undefined}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    tabIndex={copy === 1 ? -1 : undefined}
                    onClick={() => void ask(s)}
                    disabled={busy}
                    className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="flex items-end gap-2 border-t border-slate-200 p-3"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter 로 보내고, Shift+Enter 로 줄바꿈 (한글 조합 중에는 보내지 않음)
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask(input);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="궁금한 걸 적어 보세요 (Enter 로 보내기)"
            aria-label="질문"
            className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="보내기"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            <ArrowRightIcon className="h-5 w-5" />
          </button>
        </form>
        </div>
      </div>

      {messages.length > 0 && (
        <button type="button" onClick={() => setMessages([])} disabled={busy} className="mx-auto mt-3 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50">
          새 대화 시작
        </button>
      )}
        </>
      )}
    </div>
  );
}

/** 업무 안내 글 · 학생 소개 최대 길이 (서버 guideStore 와 같음) */
const GUIDE_MAX = 20000;
const STUDENTS_INTRO_MAX = 10000;

/** 2026-11-12 오후 3:05 */
const when = (ms: number) => new Date(ms).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

type Saved = { text: string; students: string; updatedAt: number | null };

const TABS = [
  { id: "text", label: "업무 안내" },
  { id: "students", label: "학생 소개" },
] as const;

/**
 * 챗봇이 참고하는 업무 안내(인수인계) 글과 학생 소개를 고치는 곳. 학생 정보가 들어가므로 코드가 아니라 서버 저장소에 저장함 (/api/guide)
 */
function GuideEditor({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"text" | "students">("text");
  const [text, setText] = useState("");
  const [students, setStudents] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (data: { text?: string; students?: string; updatedAt?: number | null }) => {
    const next = { text: data.text ?? "", students: data.students ?? "", updatedAt: data.updatedAt ?? null };
    setSaved(next);
    setText(next.text);
    setStudents(next.students);
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/guide", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { text?: string; students?: string; updatedAt?: number | null; error?: string } | null;
        if (!res.ok || !data) throw new Error(data?.error ?? "업무 안내를 불러오지 못했어요.");
        if (!cancelled) apply(data);
      })
      .catch((e: unknown) => !cancelled && setMsg({ ok: false, text: e instanceof Error ? e.message : "업무 안내를 불러오지 못했어요." }));
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = saved !== null && (text.trim() !== saved.text || students.trim() !== saved.students);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/guide", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, students }) });
      const data = (await res.json().catch(() => null)) as { text?: string; students?: string; updatedAt?: number; error?: string } | null;
      if (!res.ok || !data) throw new Error(data?.error ?? "저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
      apply(data);
      setMsg({ ok: true, text: "✓ 저장했어요. 이제 챗봇이 이 내용으로 답해요." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장하지 못했어요." });
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm("저장하지 않은 내용이 있어요. 그래도 닫을까요?")) return;
    onClose();
  };

  const isText = tab === "text";
  const value = isText ? text : students;
  const max = isText ? GUIDE_MAX : STUDENTS_INTRO_MAX;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {saved === null && !msg ? (
        <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-500">
          <Spinner className="h-5 w-5" /> 불러오는 중…
        </div>
      ) : (
        <>
          {/* 업무 안내 | 학생 소개 */}
          <div role="tablist" aria-label="편집할 내용" className="inline-flex rounded-xl bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {!isText && (
            <p className="text-xs leading-relaxed text-slate-500">
              「느티나무반 학생들에 대해 알려 주세요」라고 물으면 챗봇이 이 소개로 답해요. 한 줄에 한 학생씩, 학년-반 이름과 성격 · 좋아하는 것 · 취미를 적어 주세요.
            </p>
          )}
          <textarea
            key={tab}
            value={value}
            onChange={(e) => (isText ? setText : setStudents)(e.target.value)}
            maxLength={max}
            aria-label={isText ? "업무 안내 내용" : "학생 소개 내용"}
            placeholder={
              isText
                ? "예)\n[출근 · 아침 일과]\n- 08:20 까지 교실로 출근\n\n[학생별 지원]\n- 이동 수업 · 급식 · 쉬는 시간에 할 일"
                : "예)\n1-1 ○○이는 그림 그리는 것을 정말 좋아해요. 유튜브 채널도 운영해요 (주소)\n2-2 ○○이는 축구하는 것을 좋아해요."
            }
            className="h-[min(60vh,32rem)] w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-[15px] leading-relaxed outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{saved?.updatedAt ? `마지막 저장: ${when(saved.updatedAt)}` : "아직 저장한 적이 없어요."}</span>
            <span className="tabular-nums">
              {value.length.toLocaleString()} / {max.toLocaleString()}자
            </span>
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            이 내용은 학교 서버 저장소에만 저장되고 로그인한 사람만 볼 수 있어요. 챗봇이 답을 만들 때 Google Gemini로 보내지만, 학생 이름은 「학생A」처럼 바꿔서 보내고 전화번호 · 주민등록번호는 지워서 보내요.
          </p>
        </>
      )}

      {msg && (
        <p role="status" className={`text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={close} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
          채팅으로 돌아가기
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {busy && <Spinner className="h-4 w-4" />}
          저장
        </button>
      </div>
    </div>
  );
}
