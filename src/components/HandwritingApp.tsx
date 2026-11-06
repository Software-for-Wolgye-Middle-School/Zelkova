"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CELL_MM,
  FONTS,
  LEVELS,
  MODES,
  pageSvg,
  paginate,
  parsePhrases,
  phrasesFor,
  SHEET_PX,
  worksheetPdf,
  type FontKind,
  type Level,
  type Mode,
  type Options,
  WEB_FONTS_URL,
} from "@/lib/handwriting";
import { downloadBlob } from "@/lib/svgExport";
import { DownloadIcon, Spinner, XIcon } from "./icons";
import { SlideCarousel, StepHeading, StepNav, StepProgress, useStepFlow, type Step } from "./StepFlow";

const chip = (on: boolean) =>
  `rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-inset transition ${
    on ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
  }`;

type Source = "example" | "custom";

const START: Step = { title: "시작", heading: "어떤 글로 학습지를 만들까요?" };
const MODE_STEP: Step = { title: "쓰기 방식", heading: "어떻게 쓸까요?" };
const LOOK_STEP: Step = { title: "글꼴 · 크기", heading: "글꼴과 글자 크기를 골라 주세요" };
/** 예시 문구: 시작 → 주제(글의 길이) → 쓰기 방식 → 글꼴 · 크기 + 다운로드 */
const EXAMPLE_STEPS: Step[] = [START, { title: "주제", heading: "어떤 길이의 글을 쓸까요?", hint: "여러 주제의 문구가 골고루 들어가요." }, MODE_STEP, LOOK_STEP];
/** 직접 입력: 시작 → 쓰기 방식 → 글꼴 · 크기 → 문구 입력 + 다운로드 */
const CUSTOM_STEPS: Step[] = [START, MODE_STEP, LOOK_STEP, { title: "문구 입력", heading: "쓸 문구를 적어 주세요", hint: "한 줄에 한 문구씩 적어요." }];

/** 직접 입력에서 문구를 아직 쓰지 않았을 때 미리보기에 보여 줄 글 */
const SAMPLE = ["여기에 적은 문구가 들어가요."];

const SAVED_KEY = "zelkova:handwriting-phrases";
const MAX_SAVED = 100;

function loadSaved(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function storeSaved(list: string[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    // 저장 공간이 없거나 막힌 브라우저: 이번 화면에서만 유지
  }
}

export default function HandwritingApp() {
  const { step, checking, goStep, goNext, fadeClass } = useStepFlow();
  const [source, setSource] = useState<Source>("example");
  const [level, setLevel] = useState<Level>("sentence");
  const [mode, setMode] = useState<Mode>("trace");
  const [font, setFont] = useState<FontKind>("gothic");
  const [cell, setCell] = useState<number>(CELL_MM.default);
  const [guide, setGuide] = useState(true);
  const [customText, setCustomText] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 브라우저에서만 읽을 수 있음
    setSaved(loadSaved());
  }, []);

  const steps = source === "example" ? EXAMPLE_STEPS : CUSTOM_STEPS;
  const last = step === steps.length - 1;
  const options = useMemo<Options>(() => ({ mode, cell, font, guide }), [mode, cell, font, guide]);

  const base = useMemo(() => phrasesFor(level), [level]);
  const custom = useMemo(() => parsePhrases(customText), [customText]);
  /** 예시: 고른 길이의 모든 주제 문구 · 직접 입력: 적은 문구 */
  const phrases = source === "example" ? base : custom;
  const shown = phrases.length ? phrases : SAMPLE;

  const pages = useMemo(() => paginate(shown, options), [shown, options]);
  const svgs = useMemo(() => pages.map((p, i) => pageSvg(p, i, options)), [pages, options]);

  /** 지금 적은 문구를 저장 목록에 더함 (같은 문구는 한 번만) */
  const savePhrases = () => {
    const next = [...new Set([...saved, ...custom])].slice(-MAX_SAVED);
    setSaved(next);
    storeSaved(next);
  };
  const removeSaved = (phrase: string) => {
    const next = saved.filter((s) => s !== phrase);
    setSaved(next);
    storeSaved(next);
  };
  /** 저장한 문구를 눌러 입력칸 끝에 넣음 */
  const insertSaved = (phrase: string) => setCustomText((t) => (t.trim() ? `${t.replace(/\n+$/, "")}\n${phrase}` : phrase));

  const download = async () => {
    if (!phrases.length) return;
    setBusy(true);
    setExportError(null);
    try {
      downloadBlob(await worksheetPdf(paginate(phrases, options), options), "바른 글씨 쓰기.pdf");
    } catch (e) {
      console.error(e);
      setExportError("PDF로 저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const downloadButton = (
    <div className="space-y-2 border-t border-slate-100 pt-5">
      <button
        type="button"
        onClick={download}
        disabled={!phrases.length || busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
      >
        {busy ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
        PDF 다운로드 ({phrases.length ? pages.length : 0}장)
      </button>
      {!phrases.length && <p className="text-center text-xs text-slate-400">문구를 적으면 내려받을 수 있어요</p>}
      {exportError && (
        <p role="alert" className="text-center text-xs font-medium text-red-600">
          {exportError}
        </p>
      )}
    </div>
  );

  const current = steps[step];

  return (
    <div className="fade-up mx-auto max-w-5xl">
      {/* 미리보기에 쓰는 웹 글꼴 (React 가 문서 head 로 옮겨 한 번만 불러옴) */}
      <link rel="stylesheet" href={WEB_FONTS_URL} precedence="default" />
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">긍정 · 감성 필사 교실</h1>
        <p className="mt-2 text-[15px] text-slate-500">마음이 자라는 글을 따라 쓰는 학습지를 만들어요.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="h-fit space-y-5 overflow-x-clip rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <StepProgress steps={steps} step={step} checking={checking} onGo={goStep} />

          <div className={`space-y-5 ${fadeClass}`}>
            <StepHeading step={current} />

            {current === START && (
              <div className="grid gap-2" role="radiogroup" aria-label="글 고르기">
                {(
                  [
                    ["example", "예시 문구로 만들기", "준비된 긍정 · 감성 문구를 써요."],
                    ["custom", "직접 입력하기", "선생님이 정한 문구를 적어서 써요."],
                  ] as const
                ).map(([id, label, hint]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={source === id}
                    onClick={() => setSource(id)}
                    className={`rounded-xl px-4 py-3 text-left ring-1 ring-inset transition ${
                      source === id ? "bg-indigo-50 ring-2 ring-indigo-400" : "bg-white ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`block text-[15px] font-semibold ${source === id ? "text-indigo-700" : "text-slate-800"}`}>{label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>
            )}

            {current.title === "주제" && (
              <div className="grid grid-cols-3 gap-1.5">
                {LEVELS.map((l) => (
                  <button key={l.id} type="button" aria-pressed={level === l.id} onClick={() => setLevel(l.id)} className={chip(level === l.id)}>
                    {l.label}
                    <span className="block text-[11px] font-normal text-slate-400">{l.hint}</span>
                  </button>
                ))}
              </div>
            )}

            {current === MODE_STEP && (
              <div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MODES.map((m) => (
                    <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={chip(mode === m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>
                {MODES.find((m) => m.id === mode)!.hint && <p className="mt-1.5 text-xs text-slate-500">{MODES.find((m) => m.id === mode)!.hint}</p>}
              </div>
            )}

            {current === LOOK_STEP && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="hw-font" className="mb-1.5 block text-xs font-semibold text-slate-600">
                    글꼴
                  </label>
                  <select
                    id="hw-font"
                    value={font}
                    onChange={(e) => setFont(e.target.value as FontKind)}
                    style={{ fontFamily: FONTS.find((f) => f.id === font)!.css }}
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  >
                    {FONTS.map((f) => (
                      <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="hw-size" className="text-xs font-semibold text-slate-600">
                      글자 크기
                    </label>
                    <span className="text-xs font-semibold text-indigo-700">칸 {cell}mm</span>
                  </div>
                  <input
                    id="hw-size"
                    type="range"
                    min={CELL_MM.min}
                    max={CELL_MM.max}
                    step={1}
                    value={cell}
                    onChange={(e) => setCell(Number(e.target.value))}
                    className="mt-2 w-full accent-indigo-600"
                  />
                  <div className="mt-0.5 flex justify-between text-[11px] text-slate-400">
                    <span>작게</span>
                    <span>크게</span>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                  칸 안에 십자 점선 보이기
                </label>
              </div>
            )}

            {current.title === "문구 입력" && (
              <div className="space-y-3">
                <textarea
                  id="hw-custom"
                  aria-label="쓸 문구"
                  value={customText}
                  rows={5}
                  placeholder={"예: 고운 말은 친구를 웃게 해요.\n나는 나라서 참 소중해요."}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                />
                <button
                  type="button"
                  onClick={savePhrases}
                  disabled={!custom.length || custom.every((c) => saved.includes(c))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  문구 저장
                </button>
                {saved.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-slate-600">저장한 문구 · 누르면 위에 넣어요</p>
                    <ul className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto" aria-label="저장한 문구">
                      {saved.map((s) => (
                        <li key={s} className="inline-flex max-w-full items-center rounded-full bg-slate-50 ring-1 ring-inset ring-slate-200">
                          <button
                            type="button"
                            onClick={() => insertSaved(s)}
                            className="truncate rounded-l-full py-1 pl-2.5 pr-1 text-left text-xs font-semibold text-slate-700 hover:text-indigo-700"
                          >
                            {s}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSaved(s)}
                            aria-label={`저장한 문구 지우기: ${s}`}
                            className="mr-1 grid h-4 w-4 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <XIcon className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {last && downloadButton}
          </div>

          <StepNav step={step} last={last} canNext checking={checking} onPrev={() => goStep(step - 1)} onNext={() => goNext()} />
        </div>

        <section aria-label="학습지 미리보기" className="min-w-0">
          <SlideCarousel
            key={`${source}-${pages.length}`}
            count={svgs.length}
            caption={(i) => `${i + 1} / ${svgs.length}쪽${!phrases.length ? " · 문구를 적으면 바뀌어요" : ""}`}
            aspectRatio={`${SHEET_PX.w} / ${SHEET_PX.h}`}
            maxWidth={520}
            render={(i) => (
              <div
                className="h-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                // pageSvg 는 문구를 XML 이스케이프한 뒤 직접 만든 SVG 문자열
                dangerouslySetInnerHTML={{ __html: svgs[i] ?? "" }}
              />
            )}
          />
        </section>
      </div>
    </div>
  );
}
