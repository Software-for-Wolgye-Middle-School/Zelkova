"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "./icons";

/**
 * 칭찬통장 · 나와의 약속판이 함께 쓰는 단계 진행 화면:
 * 위쪽 단계 표시(체크가 그려지며 다음 단계로), 단계 사이 서서히 바뀌는 화면, 아래 이전 · 다음 버튼, 좌우로 넘기는 미리보기.
 */

export const CHECK_MS = 600;
export const SLIDE_MS = 450;
const FADE_OUT_MS = 200;

export type Step = { title: string; heading: string; hint?: string };

export function useStepFlow() {
  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);
  const [fadeTo, setFadeTo] = useState(0);
  const [checking, setChecking] = useState(false);

  /** 단계를 바꿀 때 화면이 서서히 사라졌다가 새 화면이 서서히 나타남. then 은 화면이 사라진 순간에 실행 */
  const goStep = (n: number, then?: () => void) => {
    if (n === step || fading) return;
    setFadeTo(n);
    setFading(true);
    setTimeout(() => {
      then?.();
      setStep(n);
      setChecking(false);
      setFading(false);
    }, FADE_OUT_MS);
  };

  /** 체크 표시가 그려진 뒤에 다음 단계로 넘어감 */
  const goNext = (then?: () => void) => {
    if (checking || fading) return;
    setChecking(true);
    setTimeout(() => goStep(step + 1, then), CHECK_MS);
  };

  /** 단계는 그대로 두고 화면만 서서히 바꿈 (같은 단계 안에서 다음 학생으로 넘어갈 때) */
  const refade = (change: () => void) => {
    if (fading) return;
    setFadeTo(step);
    setFading(true);
    setTimeout(() => {
      change();
      setFading(false);
    }, FADE_OUT_MS);
  };

  const fadeClass = `transition-[opacity,transform] ease-in-out motion-reduce:transition-none ${
    fading ? "translate-y-1 opacity-0 duration-200" : "translate-y-0 opacity-100 duration-300"
  }`;
  return { step, fadeTo, fading, checking, goStep, goNext, refade, fadeClass };
}

/** 위쪽 단계 표시. 지난 단계는 눌러서 돌아갈 수 있음 */
export function StepProgress({ steps, step, checking, onGo }: { steps: readonly Step[]; step: number; checking: boolean; onGo: (n: number) => void }) {
  return (
    <ol className="flex items-center" aria-label="진행 단계">
      {steps.map((s, i) => (
        <li key={s.title} className="flex flex-1 items-center last:flex-none" aria-current={i === step ? "step" : undefined}>
          <button type="button" onClick={() => i <= step && onGo(i)} disabled={i > step} className="flex flex-col items-center gap-1 disabled:cursor-default">
            <span
              className={`relative grid h-8 w-8 place-items-center rounded-full text-sm font-bold transition ${
                i < step ? "bg-indigo-600 text-white" : i === step ? "bg-indigo-600 text-white ring-4 ring-indigo-100" : "bg-slate-100 text-slate-400"
              }`}
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
              <span
                className={`block h-full origin-left rounded bg-indigo-600 transition-transform duration-500 ease-out motion-reduce:transition-none ${i < step ? "scale-x-100" : "scale-x-0"}`}
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
  "inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none";

/** 아래쪽 이전 · 다음 버튼 줄. extra 는 다음 버튼 왼쪽에 놓는 버튼 */
export function StepNav({
  step,
  last,
  canNext,
  checking,
  onPrev,
  onNext,
  extra,
}: {
  step: number;
  last: boolean;
  canNext: boolean;
  checking: boolean;
  onPrev: () => void;
  onNext: () => void;
  extra?: ReactNode;
}) {
  return (
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
          <button type="button" onClick={onNext} disabled={!canNext || checking} className={nextButtonClass}>
            다음
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

const arrowClass =
  "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-200 transition hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 좌우 화살표로 넘기는 미리보기. 오른쪽: 지금 종이가 오른쪽으로 밀려나며 다음 종이가 드러남,
 * 왼쪽: 앞 종이가 오른쪽에서 와서 덮음. render(i) 는 i 번째 종이 안에 들어갈 내용
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
  const slide = (i: number, offset: boolean) => (
    <div
      key={i}
      className={`absolute inset-0 transition-transform ease-in-out motion-reduce:transition-none ${slideClassName}`}
      style={{ transform: offset ? "translateX(105%)" : "translateX(0)", transitionDuration: `${SLIDE_MS}ms` }}
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
          {anim
            ? anim.to > anim.from
              ? [slide(anim.to, false), slide(anim.from, anim.slid)]
              : [slide(anim.from, false), slide(anim.to, !anim.slid)]
            : slide(cur, false)}
        </div>
        <button type="button" onClick={() => flip(cur + 1)} disabled={cur >= count - 1 || !!anim} aria-label="다음 장 보기" className={arrowClass}>
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </figure>
  );
}
