"use client";

import { MotionConfig, motion, useReducedMotion } from "motion/react";
import type { ComponentType, SVGProps } from "react";
import {
  ArrowRightIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  PencilIcon,
  TagIcon,
  UsersIcon,
  UtensilsIcon,
  WalletIcon,
} from "./icons";
import BorderBeam from "./smoothui/border-beam";
import GlowHover from "./smoothui/glow-hover-card";
import RevealText from "./smoothui/reveal-text";
import { Tilt } from "./unlumen/tilt";
import ZelkovaScene from "./ZelkovaScene";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
/** 메뉴 카드 하나. hue 는 마우스를 가까이 댔을 때 번지는 빛의 색 (HSL 색상각) */
type Menu = { id: string; title: string; desc: string; icon: Icon; tile: string; hue: number; onClick: () => void };

/** 등장 순서: 제목 → 대표 카드 → 나머지 카드 (ms) */
const HERO_WORD_DELAY = 90;
const appear = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
});

export default function Landing({
  onStartTimetable,
  onStartPromise,
  onStartBankbook,
  onStartNameTag,
  onStartMeal,
  onStartStudents,
  onStartHandwriting,
}: {
  onStartTimetable: () => void;
  onStartPromise: () => void;
  onStartBankbook: () => void;
  onStartNameTag: () => void;
  onStartMeal: () => void;
  onStartStudents: () => void;
  onStartHandwriting: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const menus: Menu[] = [
    { id: "promise", title: "나와의 약속판", desc: "학생마다 이 달의 약속을 담아요", icon: ClipboardCheckIcon, tile: "bg-pink-100 text-pink-600", hue: 330, onClick: onStartPromise },
    { id: "bankbook", title: "칭찬통장", desc: "학생별 칭찬통장을 PDF로", icon: WalletIcon, tile: "bg-amber-100 text-amber-600", hue: 38, onClick: onStartBankbook },
    { id: "nametag", title: "이름표", desc: "아이콘 · 테두리를 골라 한꺼번에", icon: TagIcon, tile: "bg-emerald-100 text-emerald-700", hue: 155, onClick: onStartNameTag },
    { id: "meal", title: "급식표 조회", desc: "이번 달 급식 안내를 한눈에", icon: UtensilsIcon, tile: "bg-sky-100 text-sky-700", hue: 200, onClick: onStartMeal },
    { id: "handwriting", title: "긍정 · 감성 필사 교실", desc: "마음이 자라는 글 따라 쓰기", icon: PencilIcon, tile: "bg-rose-100 text-rose-600", hue: 350, onClick: onStartHandwriting },
    { id: "students", title: "학생 정보 관리", desc: "한 번 등록하면 모든 도구에서", icon: UsersIcon, tile: "bg-violet-100 text-violet-700", hue: 262, onClick: onStartStudents },
  ];

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
            {/* 대표 기능: 테두리를 따라 빛줄기가 돌고, 마우스를 따라 살짝 기울어짐 */}
            <motion.div {...appear(0.35)}>
              <Tilt rotationFactor={reduceMotion ? 0 : 3} springOptions={{ stiffness: 220, damping: 20 }}>
                <BorderBeam radius={24} borderWidth={1.5} duration={7} size={120} colorFrom="#a5b4fc" colorTo="#f0abfc" className="rounded-3xl">
                  <button
                    type="button"
                    onClick={onStartTimetable}
                    className="group flex w-full items-center gap-4 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-left text-white shadow-xl shadow-indigo-900/25 transition hover:from-indigo-500 hover:to-violet-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 sm:p-5"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 sm:h-14 sm:w-14">
                      <CalendarIcon className="h-6 w-6 sm:h-7 sm:w-7" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-bold sm:text-xl">특수학급 시간표 만들기</span>
                      <span className="mt-0.5 block text-sm text-indigo-100">전체 시간표와 학생별 시간표를 한 번에 만들어요</span>
                    </span>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-indigo-600 shadow transition group-hover:translate-x-0.5">
                      <ArrowRightIcon className="h-5 w-5" />
                    </span>
                  </button>
                </BorderBeam>
              </Tilt>
            </motion.div>

            {/* 나머지 기능: 마우스를 가까이 대면 카드마다 제 색의 빛이 번짐 */}
            <motion.div {...appear(0.5)}>
              <GlowHover
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                maskSize={320}
                glowIntensity={0.12}
                items={menus.map((m) => ({
                  id: m.id,
                  theme: { hue: m.hue, saturation: 85, lightness: 55 },
                  element: (
                    <button
                      type="button"
                      onClick={m.onClick}
                      className="group flex w-full items-center gap-3 rounded-2xl border border-white/80 bg-white/80 p-3.5 text-left shadow-lg shadow-emerald-950/10 backdrop-blur-md transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    >
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${m.tile}`}>
                        <m.icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-slate-900">{m.title}</span>
                        <span className="block truncate text-xs text-slate-500">{m.desc}</span>
                      </span>
                      <ArrowRightIcon className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                    </button>
                  ),
                }))}
              />
            </motion.div>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
