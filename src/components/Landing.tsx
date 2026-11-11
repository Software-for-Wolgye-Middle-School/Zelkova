"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import GrowingTree from "./GrowingTree";
import { ArrowRightIcon } from "./icons";
import { CATEGORIES, TOOLS, type ToolCategory, type ToolId } from "./tools";

/** 이번 방문에서 나무가 다 자란 것을 봤으면, 도구 화면에서 돌아올 때 바로 도구 목록을 보여 줌 */
const GROWN_KEY = "zelkova.treeGrown";

// ---------------------------------------------------------------- 선택한 탭: 주소의 #general · #assistant · #teacher 로 기억

const TAB_EVENT = "zelkova:tab";
const readTab = (): ToolCategory => {
  const hash = window.location.hash.slice(1);
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

// ---------------------------------------------------------------- 나무 성장 타임라인 (길이 100 = 스크롤 진행도 0 ~ 100%)

function growthTimeline() {
  const pop = (from: number) => ({ scale: 0, rotation: from, opacity: 0, transformOrigin: "0% 50%" });
  const blob = { scale: 0, opacity: 0, transformOrigin: "50% 50%" };
  const blobIn = (stagger: number) => ({ scale: 1, opacity: 1, duration: 6, stagger, ease: "back.out(1.6)" });

  return (
    gsap
      .timeline({ defaults: { ease: "none" } })
      // 1. 0–15%: 흙 위의 씨앗이 조금 부풀고, 스크롤 안내는 사라짐
      .to(".gt-seed-l, .gt-seed-r", { y: -3, duration: 15 }, 0)
      .to(".lt-hint", { opacity: 0, y: 10, duration: 6 }, 0)
      // 2. 15–35%: 씨앗이 갈라지고 떡잎 두 장이 올라옴
      .to(".gt-seed-l", { rotation: -40, x: -7, svgOrigin: "300 483", duration: 7, ease: "power1.out" }, 15)
      .to(".gt-seed-r", { rotation: 40, x: 7, svgOrigin: "300 483", duration: 7, ease: "power1.out" }, 15)
      .to(".gt-seed", { opacity: 0, duration: 8 }, 22)
      .to(".gt-stem", { strokeDashoffset: 0.62, duration: 10 }, 16)
      .fromTo(".gt-cotyledon", pop(-20), { scale: 1, rotation: 0, opacity: 1, duration: 8, stagger: 3, ease: "back.out(2)" }, 23)
      // 3. 35–60%: 줄기가 위로 뻗고 잎이 하나씩 톡톡 돋아남
      .to(".gt-stem", { strokeDashoffset: 0, duration: 15 }, 35)
      .fromTo(".gt-young-leaf", pop(-25), { scale: 1, rotation: 0, opacity: 1, duration: 5, stagger: 3, ease: "back.out(2)" }, 39)
      // 4. 60–85%: 짧고 굵은 줄기에서 가지가 부채꼴로 퍼짐
      .to(".gt-trunk", { strokeDashoffset: 0, duration: 9, ease: "power1.inOut" }, 60)
      .to(".gt-roots", { opacity: 1, duration: 6 }, 64)
      .to(".gt-stem, .gt-cotyledon, .gt-young-leaf", { opacity: 0, duration: 8 }, 62)
      .to(".gt-branch", { strokeDashoffset: 0, duration: 9, stagger: 1.5, ease: "power1.out" }, 66)
      .to(".gt-twig", { strokeDashoffset: 0, duration: 6, stagger: 1, ease: "power1.out" }, 74)
      .to(".gt-shadow", { opacity: 0.25, duration: 30 }, 60)
      // 5. 85–100%: 둥글고 풍성한 수관이 채워짐
      .fromTo(".gt-crown-back .gt-blob", blob, blobIn(0.6), 82)
      .fromTo(".gt-crown-mid .gt-blob", blob, blobIn(0.6), 86)
      .fromTo(".gt-crown-front .gt-blob", blob, blobIn(0.5), 90)
      .fromTo(".gt-speckle", blob, { scale: 1, opacity: 0.9, duration: 3, stagger: 0.4, ease: "back.out(2)" }, 95)
      // 배경: 이른 아침의 연한 하늘 → 따뜻한 햇살, 해가 떠오름. 제목은 나무와 함께 등장
      .to(".lt-warm", { opacity: 1, duration: 70 }, 25)
      .fromTo(".lt-sun", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 50 }, 35)
      .fromTo(".lt-title", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 15, ease: "power2.out" }, 80)
  );
}

/** 다 자란 뒤에도 바람에 잎이 살랑임 (transform 만 움직임) */
function idleMotion() {
  const sway = { duration: 3.2, ease: "sine.inOut", yoyo: true, repeat: -1 };
  gsap.to(".gt-seed", { rotation: 5, svgOrigin: "300 483", ...sway, duration: 1.4 });
  gsap.to(".gt-sway", { rotation: 1.2, svgOrigin: "300 396", ...sway });
  gsap.to(".gt-crown-mid", { x: 2.5, ...sway, duration: 2.7 });
  gsap.to(".gt-crown-front", { rotation: -1.6, svgOrigin: "300 230", ...sway, duration: 2.3 });
}

export default function Landing({ onOpen }: { onOpen: (id: ToolId) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const toolsRef = useRef<HTMLElement>(null);
  const tab = useSyncExternalStore(subscribeTab, readTab, () => "general" as const);
  const tools = TOOLS.filter((t) => t.category === tab);

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const hero = heroRef.current;
    const toolsEl = toolsRef.current;
    if (!hero || !toolsEl) return;

    const mm = gsap.matchMedia(rootRef);
    // 조건 중 하나라도 맞아야 실행되므로, 늘 맞는 all 을 넣어 데스크톱 · 움직임 허용에서도 실행되게 함
    mm.add({ all: "all", reduce: "(prefers-reduced-motion: reduce)", mobile: "(max-width: 767px)" }, (ctx) => {
      const { reduce, mobile } = ctx.conditions as { reduce: boolean; mobile: boolean };
      const tl = growthTimeline();
      // 움직임 줄이기: 애니메이션 없이 다 자란 나무와 도구 목록을 바로 보여 줌
      if (reduce) {
        tl.progress(1);
        return;
      }

      // 히어로를 고정해 두고 스크롤하는 동안 나무가 자람 (되돌리면 다시 작아짐)
      ScrollTrigger.create({ animation: tl, trigger: hero, start: "top top", end: mobile ? "+=90%" : "+=160%", pin: true, scrub: true, anticipatePin: 1 });
      idleMotion();

      // 나무가 다 자라면 그 아래에서 탭과 도구 카드가 떠오름
      gsap.from(".lt-tools", {
        opacity: 0,
        y: 40,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: toolsEl,
          start: "top 85%",
          once: true,
          onEnter: () => {
            try {
              sessionStorage.setItem(GROWN_KEY, "1");
            } catch {}
          },
        },
      });

      // 도구 화면에서 돌아왔으면 다시 씨앗부터 보지 않고 도구 목록으로
      let seen = false;
      try {
        seen = sessionStorage.getItem(GROWN_KEY) === "1";
      } catch {}
      if (seen) {
        ScrollTrigger.refresh();
        window.scrollTo(0, toolsEl.getBoundingClientRect().top + window.scrollY - 16);
      }
    });
    return () => mm.revert();
  }, []);

  const open = (id: ToolId) => {
    window.scrollTo(0, 0); // 도구 화면은 맨 위부터
    onOpen(id);
  };
  const skipToTools = () => toolsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  /** 탭에서 ← → 로 옆 탭으로 옮김 */
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = CATEGORIES.findIndex((c) => c.id === tab);
    const next = CATEGORIES[(i + (e.key === "ArrowRight" ? 1 : CATEGORIES.length - 1)) % CATEGORIES.length].id;
    writeTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    // flex 세로 배치 안에서는 고정 구간(pin-spacer)의 높이가 눌려 스크롤 길이가 생기지 않으므로 일반 블록으로 둠
    <div ref={rootRef} className="flex-1 bg-[#fbf7ee]">
      <section ref={heroRef} className="relative isolate h-svh overflow-hidden" aria-labelledby="landing-title">
        {/* 이른 아침 하늘 위에 따뜻한 햇살 층이 서서히 겹쳐짐 */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#d9ecf8] via-[#eef6f3] to-[#fbf7ee]" />
        <div className="lt-warm absolute inset-0 -z-10 bg-gradient-to-b from-[#fde3ad] via-[#fdf0d5] to-[#fbf7ee] opacity-0" />
        <div className="lt-sun absolute right-[10%] top-[8%] -z-10 h-44 w-44 rounded-full bg-[radial-gradient(circle,#fffbe8_0%,#ffe39a_35%,transparent_70%)] opacity-0 sm:h-64 sm:w-64" />

        <div className="flex h-full flex-col items-center justify-center px-4 pb-8 pt-6">
          <h1 id="landing-title" className="lt-title text-center text-3xl font-extrabold tracking-tight text-[#2f4a24] opacity-0 sm:text-5xl">
            느티나무 교실 도우미
          </h1>
          <GrowingTree className="mt-2 h-[min(56svh,400px)] w-auto max-w-full sm:mt-4 sm:h-[min(62svh,600px)]" />
          {/* 자리를 차지하지 않게 아래쪽에 겹쳐 둠. 처음에는 위 헤더만큼 히어로가 밀려 있으므로 그만큼 올려 둠 */}
          <div className="lt-hint absolute inset-x-0 bottom-20 flex flex-col items-center gap-2 text-sm font-medium text-stone-600">
            <span>아래로 내리면 씨앗이 자라요</span>
            <button
              type="button"
              onClick={skipToTools}
              className="rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-green-800 shadow-sm ring-1 ring-green-900/10 transition hover:bg-white"
            >
              바로 도구 보기 ↓
            </button>
          </div>
        </div>
      </section>

      <section ref={toolsRef} aria-label="도구" className="lt-tools mx-auto w-full max-w-5xl scroll-mt-4 px-4 pb-16 pt-10 sm:px-6">
        <div role="tablist" aria-label="누구를 위한 도구인가요" className="mx-auto flex w-full max-w-xl rounded-2xl bg-[#efe6d3] p-1.5">
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
                onClick={() => writeTab(c.id)}
                onKeyDown={onTabKey}
                className={`flex-1 whitespace-nowrap rounded-xl px-2 py-2.5 text-sm font-semibold transition sm:text-[15px] ${
                  selected ? "bg-white text-green-800 shadow-sm" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        <div id="tool-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-6">
          {tools.length ? (
            <ul key={tab} className="fade-up grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => open(t.id)}
                    className="group flex w-full items-center gap-4 rounded-3xl bg-white p-5 text-left shadow-[0_2px_10px_rgba(80,60,30,0.06)] ring-1 ring-stone-200/70 transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(80,60,30,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${t.tone}`}>
                      <t.icon className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1 text-[17px] font-bold text-stone-800">{t.title}</span>
                    <ArrowRightIcon className="h-5 w-5 shrink-0 text-[#a0714a] transition group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div key={tab} className="fade-up mx-auto flex max-w-md flex-col items-center rounded-3xl border border-dashed border-[#d8c9a8] bg-white/60 px-6 py-12 text-center">
              <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
                <ellipse cx="32" cy="56" rx="18" ry="4" fill="#d9bf98" />
                <path d="M32 56 C32 46 32 40 32 32" stroke="#6aa84f" strokeWidth="3" strokeLinecap="round" fill="none" />
                <path d="M32 36 C26 24 14 24 12 30 C16 38 26 39 32 36 Z" fill="#94cf63" />
                <path d="M32 32 C36 20 48 18 52 24 C49 33 39 35 32 32 Z" fill="#7cc05a" />
              </svg>
              <p className="mt-4 text-lg font-bold text-stone-800">새싹이 자라는 중이에요 🌱</p>
              <p className="mt-1 text-sm text-stone-500">곧 새로운 도구가 찾아와요</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
