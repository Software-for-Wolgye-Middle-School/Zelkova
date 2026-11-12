"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, SparkleIcon, Spinner } from "./icons";

type Msg = { role: "user" | "model"; text: string };

/** 처음 화면에 보여 주는 질문 예시 (누르면 바로 물어봄) */
const SUGGESTIONS = ["출근하면 제일 먼저 뭘 해야 하나요?", "우리 반 학생들을 알려 주세요", "급식 시간에는 어떻게 도와요?", "학생이 갑자기 사라지면 어떻게 해요?"];

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
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <b key={i}>{words(part.slice(2, -2))}</b> : <span key={i}>{words(part.replace(/^\* /gm, "• "))}</span>,
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
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">업무 안내</h1>
        <p className="mt-1 text-sm text-slate-500">학교 업무나 우리 반 학생에 대해 궁금한 걸 물어보세요.</p>
      </div>

      <div className="flex h-[min(70vh,40rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-indigo-600/30">
                <SparkleIcon className="h-7 w-7" />
              </span>
              <p className="text-[15px] font-semibold text-slate-700">안녕하세요! 무엇이든 물어보세요.</p>
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700">
                    {s}
                  </button>
                ))}
              </div>
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

      {messages.length > 0 && (
        <button type="button" onClick={() => setMessages([])} disabled={busy} className="mx-auto mt-3 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50">
          새 대화 시작
        </button>
      )}
    </div>
  );
}
