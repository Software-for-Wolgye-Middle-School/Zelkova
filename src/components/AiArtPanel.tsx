"use client";

import { useEffect, useRef, useState } from "react";
import { generateAiImage, newSeed } from "@/lib/aiImage";
import { AlertIcon, RefreshIcon, SparkleIcon, Spinner, XIcon } from "./icons";

const WAIT_MESSAGES = ["그림 설명을 읽고 있어요", "밑그림을 그리고 있어요", "색을 칠하고 있어요", "거의 다 됐어요"];

export type ArtExample = { label: string; prompt: string };

/**
 * 그림 설명(프롬프트)을 받아 무료 AI(Pollinations)로 배경 그림을 만드는 칸.
 * 템플릿 구도(layout)와 사용자의 설명을 합쳐 보내고, 결과는 data: 주소로 onArt 에 넘김.
 */
export default function AiArtPanel({
  id,
  examples,
  layout,
  width,
  height,
  hasArt,
  onArt,
  title = "그림 설명 (AI 그림)",
  transparent = false,
}: {
  id: string;
  examples: ArtExample[];
  layout: string;
  width: number;
  height: number;
  hasArt: boolean;
  onArt: (dataUrl: string | undefined) => void;
  title?: string;
  /** 바탕을 투명하게 지운 그림으로 받음 */
  transparent?: boolean;
}) {
  const [prompt, setPrompt] = useState(examples[0]?.prompt ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [waitLeft, setWaitLeft] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (status !== "loading") return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [status]);

  const generate = async () => {
    if (!prompt.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus("loading");
    setElapsed(0);
    setWaitLeft(0);
    setError(null);
    try {
      const art = await generateAiImage(
        { subject: prompt, layout, width, height, seed: newSeed(), transparent },
        { signal: ctrl.signal, onWait: setWaitLeft },
      );
      if (ctrl.signal.aborted) return;
      onArt(art);
      setStatus("idle");
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : "AI 그림을 만들지 못했어요.");
      setStatus("error");
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStatus("idle");
  };

  const loading = status === "loading";

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${id}-prompt`} className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <SparkleIcon className="h-4 w-4 text-indigo-500" />
          {title}
        </label>
        <p className="mt-0.5 text-xs text-slate-500">
          원하는 그림을 한글로 적으면 무료로 그려 줘요. 무료라서 약 45초에 한 장씩 그릴 수 있어요.
        </p>
        <textarea
          id={`${id}-prompt`}
          value={prompt}
          rows={3}
          maxLength={300}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="예: 벚꽃이 핀 봄 언덕과 귀여운 토끼"
          className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setPrompt(ex.prompt)}
              aria-pressed={prompt === ex.prompt}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                prompt === ex.prompt
                  ? "bg-indigo-50 text-indigo-700 ring-indigo-300"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={loading || !prompt.trim()}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Spinner className="h-4 w-4" /> : hasArt ? <RefreshIcon className="h-4 w-4" /> : <SparkleIcon className="h-4 w-4" />}
          {loading && waitLeft > 0
            ? `무료 사용 순서를 기다리는 중… ${waitLeft}초`
            : loading
            ? `${WAIT_MESSAGES[Math.min(Math.floor(elapsed / 6), WAIT_MESSAGES.length - 1)]}… ${elapsed}초`
            : hasArt
              ? "다른 그림으로 다시 그리기"
              : "AI로 그림 그리기"}
        </button>
        {loading && (
          <button
            type="button"
            onClick={cancel}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            취소
          </button>
        )}
        {hasArt && !loading && (
          <button
            type="button"
            onClick={() => onArt(undefined)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            기본 그림
          </button>
        )}
      </div>

      {status === "error" && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setStatus("idle")} aria-label="닫기" className="text-red-400 hover:text-red-600">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
