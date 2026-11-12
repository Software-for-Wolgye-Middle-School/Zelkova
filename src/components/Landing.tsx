"use client";

import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { checkAuth } from "./auth";
import { ArrowRightIcon, LockIcon } from "./icons";
import LoginOverlay from "./LoginOverlay";
import BorderBeam from "./smoothui/border-beam";
import GlowHover from "./smoothui/glow-hover-card";
import RevealText from "./smoothui/reveal-text";
import { CATEGORIES, TOOLS, type ToolCategory, type ToolId } from "./tools";
import { Tilt } from "./unlumen/tilt";
import ZelkovaScene from "./ZelkovaScene";

/** 등장 순서: 제목 → 탭 · 대표 카드 → 나머지 카드 (ms) */
const HERO_WORD_DELAY = 90;
const appear = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
});

// ---------------------------------------------------------------- 고른 탭: 주소의 #general · #admin 으로 기억

const TAB_EVENT = "zelkova:tab";
const readTab = (): ToolCategory => {
  const hash = window.location.hash.slice(1);
  // 예전 탭 주소(실무사 · 교사 · 사회복무요원)는 하나로 묶은 행정 업무로
  if (hash === "assistant" || hash === "teacher" || hash === "agent") return "admin";
  return CATEGORIES.find((c) => c.id === hash)?.id ?? "general";
};
const subscribeTab = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(TAB_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(TAB_EVENT, onChange);
  };
};
/** 탭을 바꿔도 뒤로 가기 기록이 쌓이지 않게 주소만 바꿈 */
const writeTab = (tab: ToolCategory) => {
  window.history.replaceState(null, "", `#${tab}`);
  window.dispatchEvent(new Event(TAB_EVENT));
};
const isLocked = (tab: ToolCategory) => CATEGORIES.find((c) => c.id === tab)?.locked ?? false;

export default function Landing({ onOpen }: { onOpen: (id: ToolId) => void }) {
  const reduceMotion = useReducedMotion();
  const wantedTab = useSyncExternalStore(subscribeTab, readTab, () => "general" as const);
  /** 로그인 여부 (확인 중이면 null) */
  const [authed, setAuthed] = useState<boolean | null>(null);
  /** 로그인하면 열어 줄 탭 (로그인 창이 떠 있는 동안) */
  const [loginFor, setLoginFor] = useState<ToolCategory | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkAuth().then((ok) => {
      if (cancelled) return;
      setAuthed(ok);
      // 잠긴 탭 주소로 들어왔는데 로그인하지 않았으면 바로 로그인 창
      if (!ok && isLocked(readTab())) setLoginFor(readTab());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 로그인하지 않았으면 잠긴 탭 대신 일반 업무를 보여 줌
  const tab = isLocked(wantedTab) && !authed ? "general" : wantedTab;
  const tools = TOOLS.filter((t) => t.category === tab);
  const featured = tools.filter((t) => t.featured);
  const rest = tools.filter((t) => !t.featured);

  const chooseTab = (next: ToolCategory) => {
    if (isLocked(next) && !authed) return setLoginFor(next);
    writeTab(next);
  };
  /** 탭에서 ← → 로 옆 탭으로 옮김 */
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = CATEGORIES.findIndex((c) => c.id === tab);
    const next = CATEGORIES[(i + (e.key === "ArrowRight" ? 1 : CATEGORIES.length - 1)) % CATEGORIES.length].id;
    chooseTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <MotionConfig reducedMotion="user">
      <section className="relative isolate flex flex-1 flex-col overflow-hidden" aria-labelledby="landing-title">
        <ZelkovaScene className="absolute inset-0 -z-10 h-full w-full" />

        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-between gap-10 px-4 pb-8 pt-10 sm:pt-14">
          {/* 하늘 쪽: 제목. 단어가 차례로 떠오름 */}
          <div className="text-center [text-shadow:0_1px_18px_rgba(255,255,255,0.9)]">
            <h1 id="landing-title" className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
              <RevealText className="bg-gradient-to-br from-emerald-600 to-green-800 bg-clip-text text-transparent [text-shadow:none]">
                느티나무
              </RevealText>{" "}
              <RevealText delay={HERO_WORD_DELAY}>교실</RevealText> <RevealText delay={HERO_WORD_DELAY * 2}>도우미</RevealText>
            </h1>
          </div>

          <div className="w-full space-y-3">
            {/* 일반 업무 · 행정 업무 탭. 행정 업무 탭은 로그인해야 열림 */}
            <motion.div {...appear(0.3)} role="tablist" aria-label="누구를 위한 도구인가요" className="mx-auto flex w-full max-w-md rounded-2xl bg-white/70 p-1.5 shadow-lg shadow-emerald-950/10 ring-1 ring-white/80 backdrop-blur-md">
              {CATEGORIES.map((c) => {
                const selected = c.id === tab;
                return (
                  <button
                    key={c.id}
                    id={`tab-${c.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="tool-panel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => chooseTab(c.id)}
                    onKeyDown={onTabKey}
                    className={`inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-xl px-2 py-2.5 text-sm font-semibold transition sm:text-[15px] ${
                      selected ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {c.locked && authed === false && <LockIcon className="h-3.5 w-3.5 shrink-0" />}
                    {c.label}
                    {c.locked && authed === false && <span className="sr-only">(로그인 필요)</span>}
                  </button>
                );
              })}
            </motion.div>

            <div id="tool-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-3">
              {/* 대표 기능: 테두리를 따라 빛줄기가 돌고, 마우스를 따라 살짝 기울어짐 */}
              {featured.map((t) => (
                <motion.div key={t.id} {...appear(0.35)}>
                  <Tilt rotationFactor={reduceMotion ? 0 : 3} springOptions={{ stiffness: 220, damping: 20 }}>
                    <BorderBeam radius={24} borderWidth={1.5} duration={7} size={120} colorFrom="#a5b4fc" colorTo="#f0abfc" className="rounded-3xl">
                      <button
                        type="button"
                        onClick={() => onOpen(t.id)}
                        className="group flex w-full items-center gap-4 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-left text-white shadow-xl shadow-indigo-900/25 transition hover:from-indigo-500 hover:to-violet-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 sm:p-5"
                      >
                        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ring-white/25 sm:h-14 sm:w-14 ${t.tone}`}>
                          <t.icon className="h-6 w-6 sm:h-7 sm:w-7" />
                        </span>
                        <span className="min-w-0 flex-1 text-lg font-bold sm:text-xl">{t.title}</span>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-indigo-600 shadow transition group-hover:translate-x-0.5">
                          <ArrowRightIcon className="h-5 w-5" />
                        </span>
                      </button>
                    </BorderBeam>
                  </Tilt>
                </motion.div>
              ))}

              {/* 나머지 기능: 마우스를 가까이 대면 카드마다 제 색의 빛이 번짐 */}
              {rest.length > 0 && (
                <motion.div key={`${tab}-rest`} {...appear(0.5)}>
                  <GlowHover
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                    maskSize={320}
                    glowIntensity={0.12}
                    items={rest.map((t) => ({
                      id: t.id,
                      theme: { hue: t.hue, saturation: 85, lightness: 55 },
                      element: (
                        <button
                          type="button"
                          onClick={() => onOpen(t.id)}
                          className="group flex w-full items-center gap-3 rounded-2xl border border-white/80 bg-white/80 p-3.5 text-left shadow-lg shadow-emerald-950/10 backdrop-blur-md transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                        >
                          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${t.tone}`}>
                            <t.icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-slate-900">{t.title}</span>
                          <ArrowRightIcon className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                        </button>
                      ),
                    }))}
                  />
                </motion.div>
              )}

              {/* 아직 도구가 없는 탭 */}
              {tools.length === 0 && (
                <motion.div key={`${tab}-empty`} {...appear(0.1)} className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-white/80 bg-white/80 px-6 py-10 text-center shadow-lg shadow-emerald-950/10 backdrop-blur-md">
                  <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden="true">
                    <ellipse cx="32" cy="56" rx="18" ry="4" fill="#d9bf98" />
                    <path d="M32 56 C32 46 32 40 32 32" stroke="#6aa84f" strokeWidth="3" strokeLinecap="round" fill="none" />
                    <path d="M32 36 C26 24 14 24 12 30 C16 38 26 39 32 36 Z" fill="#94cf63" />
                    <path d="M32 32 C36 20 48 18 52 24 C49 33 39 35 32 32 Z" fill="#7cc05a" />
                  </svg>
                  <p className="mt-3 text-lg font-bold text-slate-800">새싹이 자라는 중이에요 🌱</p>
                  <p className="mt-1 text-sm text-slate-500">곧 새로운 도구가 찾아와요</p>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </section>

      {loginFor && (
        <LoginOverlay
          title={`${CATEGORIES.find((c) => c.id === loginFor)?.label} 메뉴`}
          exitLabel="닫기"
          onExit={() => {
            setLoginFor(null);
            if (isLocked(readTab())) writeTab("general"); // 잠긴 탭 주소로 들어왔다가 닫으면 주소도 일반 업무로
          }}
          onSuccess={() => {
            setAuthed(true);
            writeTab(loginFor);
            setLoginFor(null);
          }}
        />
      )}
    </MotionConfig>
  );
}
