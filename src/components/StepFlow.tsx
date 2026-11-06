"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "./icons";
import { useShake } from "./useShake";

/**
 * 칭찬통장 · 약속판 · 이름표 · 필사 교실이 함께 쓰는 단계 진행 화면:
 * 위쪽 단계 표시(체크가 그려지며 다음 단계로), 좌우로 밀리며 바뀌는 단계 화면, 아래 이전 · 다음 버튼, 좌우로 넘기는 미리보기.
 */

export const CHECK_MS = 600;
export const SLIDE_MS = 450;
/** 지금 화면이 옆으로 밀려 나가는 시간. 그다음 새 화면이 반대쪽에서 들어옴 */
const SLIDE_OUT_MS = 170;
/** 단계 표시의 선이 하나씩 차례로 채워지거나 비워지는 간격 */
const STAGGER_MS = 220;

export type Step = { title: string; heading: ReactNode; hint?: string };

/** out: 밀려 나가는 중 · in: 새 화면이 반대쪽에 놓인 순간(애니메이션 없이) · idle: 제자리로 들어옴 */
type Phase = "idle" | "out" | "in";

export function useStepFlow() {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  /** 1: 다음(오른쪽에서 들어옴) · -1: 이전(왼쪽에서 들어옴) */
  const [dir, setDir] = useState<1 | -1>(1);
  const [fadeFrom, setFadeFrom] = useState(0);
  const [fadeTo, setFadeTo] = useState(0);
  const [checking, setChecking] = useState(false);
  const fading = phase !== "idle";

  /** 화면을 옆으로 밀어 내고 change 를 한 뒤, 새 화면을 반대쪽에서 들여옴 */
  const slide = (from: number, to: number, change: () => void) => {
    setDir(to < from ? -1 : 1);
    setFadeFrom(from);
    setFadeTo(to);
    setPhase("out");
    setTimeout(() => {
      change();
      setPhase("in");
      // 반대쪽에 놓인 모습이 한 번 그려진 다음 움직이기 시작해야 미끄러져 들어옴
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase("idle")));
    }, SLIDE_OUT_MS);
  };

  /** 단계를 바꿈 (앞 단계면 오른쪽으로, 뒤 단계면 왼쪽으로 밀림). then 은 화면이 바뀌는 순간에 실행 */
  const goStep = (n: number, then?: () => void) => {
    if (n === step || fading) return;
    slide(step, n, () => {
      then?.();
      setStep(n);
      setChecking(false);
    });
  };

  /** 체크 표시가 그려진 뒤에 다음 단계로 넘어감 */
  const goNext = (then?: () => void) => {
    if (checking || fading) return;
    setChecking(true);
    setTimeout(() => goStep(step + 1, then), CHECK_MS);
  };

  /** 단계는 그대로 두고 화면만 다음으로 밀어 바꿈 (같은 단계 안에서 다음 학생으로 넘어갈 때) */
  const refade = (change: () => void) => {
    if (fading) return;
    slide(step, step, change);
  };

  const shift = (side: 1 | -1) => (side > 0 ? "translate-x-6" : "-translate-x-6");
  const fadeClass = `motion-reduce:transition-none ${
    phase === "out"
      ? `transition-[opacity,translate] duration-150 ease-in opacity-0 ${shift(dir > 0 ? -1 : 1)}`
      : phase === "in"
        ? `transition-none opacity-0 ${shift(dir)}`
        : "transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] opacity-100 translate-x-0"
  }`;
  return { step, fadeFrom, fadeTo, fading, checking, goStep, goNext, refade, fadeClass };
}

/**
 * 위쪽 단계 표시. 지난 단계는 눌러서 돌아갈 수 있음.
 * 앞으로 가면 선이 왼쪽부터, 뒤로 가면 채워졌던 선이 오른쪽부터 하나씩 차례로 비워짐
 */
export function StepProgress({ steps, step, checking, onGo }: { steps: readonly Step[]; step: number; checking: boolean; onGo: (n: number) => void }) {
  // 바로 전 단계 (단계가 바뀐 그 순간의 차례를 계산하려고 기억)
  const [track, setTrack] = useState({ step, from: step });
  if (track.step !== step) setTrack({ step, from: track.step });
  const from = track.step !== step ? track.step : track.from;
  /** i 번째 선(동그라미 i 와 i+1 사이)이 바뀌기 시작할 때까지 기다리는 시간 */
  const lineDelay = (i: number) => (step < from ? (from - 1 - i) * STAGGER_MS : (i - from) * STAGGER_MS);
  /** 동그라미는 그 앞 선이 다 바뀐 뒤에 색이 바뀜 */
  const dotDelay = (i: number) => (step < from ? Math.max(0, from - i) * STAGGER_MS : Math.max(0, i - from) * STAGGER_MS);

  return (
    <ol className="flex items-center" aria-label="진행 단계">
      {steps.map((s, i) => (
        <li key={s.title} className="flex flex-1 items-center last:flex-none" aria-current={i === step ? "step" : undefined}>
          <button type="button" onClick={() => i <= step && onGo(i)} disabled={i > step} className="flex flex-col items-center gap-1 disabled:cursor-default">
            <span
              className={`relative grid h-8 w-8 place-items-center rounded-full text-sm font-bold transition duration-300 motion-reduce:transition-none ${
                i < step ? "bg-indigo-600 text-white" : i === step ? "bg-indigo-600 text-white ring-4 ring-indigo-100" : "bg-slate-100 text-slate-400"
              }`}
              style={{ transitionDelay: `${dotDelay(i)}ms` }}
            >
              {i < step ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <>
                  <span className={i === step && checking ? "invisible" : ""}>{i + 1}</span>
                  {i === step && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute h-4 w-4" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="22" strokeDashoffset={checking ? 0 : 22} style={{ transition: `stroke-dashoffset ${CHECK_MS - 150}ms ease-out 100ms` }} />
                    </svg>
                  )}
                </>
              )}
            </span>
            <span className={`text-[11px] font-semibold ${i <= step ? "text-slate-800" : "text-slate-400"}`}>{s.title}</span>
          </button>
          {i < steps.length - 1 && (
            <span className="mx-1 mb-5 h-0.5 flex-1 overflow-hidden rounded bg-slate-200">
              {/* 왼쪽 끝을 기준으로 늘고 줄어서, 비워질 때는 오른쪽에서 왼쪽으로 줄어듦 */}
              <span
                className={`block h-full origin-left rounded bg-indigo-600 transition-transform ease-in-out motion-reduce:transition-none ${i < step ? "scale-x-100" : "scale-x-0"}`}
                style={{ transitionDuration: `${STAGGER_MS + 120}ms`, transitionDelay: `${Math.max(0, lineDelay(i))}ms` }}
              />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** 단계 제목과 짧은 안내 */
export function StepHeading({ step }: { step: Step }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">{step.heading}</h2>
      {step.hint && <p className="mt-0.5 text-xs text-slate-500">{step.hint}</p>}
    </div>
  );
}

export const nextButtonClass =
  "inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none aria-disabled:cursor-not-allowed aria-disabled:bg-slate-200 aria-disabled:text-slate-400 aria-disabled:shadow-none";

/**
 * 아래쪽 이전 · 다음 버튼 줄. extra 는 다음 버튼 왼쪽에 놓는 버튼.
 * 아직 넘어갈 수 없을 때(canNext=false) 다음을 누르면 버튼이 흔들리고 invalidMessage 를 보여 줌
 */
export function StepNav({
  step,
  last,
  canNext,
  checking,
  onPrev,
  onNext,
  extra,
  invalidMessage = "입력한 내용을 확인해 주세요.",
}: {
  step: number;
  last: boolean;
  canNext: boolean;
  checking: boolean;
  onPrev: () => void;
  onNext: () => void;
  extra?: ReactNode;
  invalidMessage?: string;
}) {
  const { shake, shakeClass } = useShake();
  /** 넘어갈 수 없을 때 다음을 누른 단계 (그 단계에서 입력을 마치면 안내가 사라짐) */
  const [blockedAt, setBlockedAt] = useState<number | null>(null);
  const blocked = !canNext && blockedAt === step;

  return (
    <>
    <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={onPrev}
        disabled={step === 0}
        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:invisible"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        이전
      </button>
      {!last && (
        <div className="flex items-center gap-2">
          {extra}
          <button
            type="button"
            onClick={() => {
              if (checking) return;
              if (canNext) return onNext();
              setBlockedAt(step);
              shake();
            }}
            aria-disabled={!canNext || checking}
            className={`${nextButtonClass} ${shakeClass}`}
          >
            다음
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
    {blocked && (
      <p role="alert" className="-mt-3 text-right text-xs font-medium text-red-600">
        {invalidMessage}
      </p>
    )}
    </>
  );
}

const arrowClass =
  "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-200 transition hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 좌우 화살표로 넘기는 미리보기. 오른쪽 화살표: 다음 종이가 오른쪽에서 와서 지금 종이를 덮음,
 * 왼쪽 화살표: 앞 종이가 왼쪽에서 와서 덮음. render(i) 는 i 번째 종이 안에 들어갈 내용
 */
export function SlideCarousel({
  count,
  render,
  caption,
  aspectRatio,
  maxWidth,
  slideClassName = "bg-white shadow-md",
}: {
  count: number;
  render: (i: number) => ReactNode;
  caption: (i: number) => ReactNode;
  aspectRatio: string;
  maxWidth: number;
  slideClassName?: string;
}) {
  const [index, setIndex] = useState(0);
  const [anim, setAnim] = useState<{ from: number; to: number; slid: boolean } | null>(null);
  const cur = Math.max(0, Math.min(index, count - 1));

  const flip = (to: number) => {
    if (anim || to < 0 || to >= count) return;
    setAnim({ from: cur, to, slid: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setAnim((a) => a && { ...a, slid: true })));
    setTimeout(() => {
      setIndex(to);
      setAnim(null);
    }, SLIDE_MS);
  };
  /** x: 종이의 가로 위치 (0 이면 제자리) */
  const slide = (i: number, x: string) => (
    <div
      key={i}
      className={`absolute inset-0 transition-transform ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${slideClassName}`}
      style={{ transform: `translateX(${x})`, transitionDuration: `${SLIDE_MS}ms` }}
    >
      {render(i)}
    </div>
  );

  return (
    <figure className="rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-5">
      <figcaption className="mb-2 text-xs font-semibold text-slate-500">{caption(cur)}</figcaption>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => flip(cur - 1)} disabled={cur === 0 || !!anim} aria-label="앞 장 보기" className={arrowClass}>
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <div className="relative mx-auto min-w-0 flex-1 overflow-hidden" style={{ aspectRatio, maxWidth }}>
          {/* 지금 종이는 제자리에 두고, 넘어갈 종이가 그 위로 들어와 덮음 */}
          {anim ? [slide(anim.from, "0"), slide(anim.to, anim.slid ? "0" : anim.to > anim.from ? "105%" : "-105%")] : slide(cur, "0")}
        </div>
        <button type="button" onClick={() => flip(cur + 1)} disabled={cur >= count - 1 || !!anim} aria-label="다음 장 보기" className={arrowClass}>
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </figure>
  );
}
