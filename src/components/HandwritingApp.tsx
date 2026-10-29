"use client";

import { useMemo, useState } from "react";
import {
  CELL_SIZES,
  FONTS,
  LEVELS,
  MODES,
  pageHtml,
  paginate,
  parsePhrases,
  phrasesFor,
  printWorksheet,
  shuffled,
  THEMES,
  worksheetCss,
  type FontKind,
  type Level,
  type Mode,
  type Options,
  type Theme,
} from "@/lib/handwriting";
import { ArrowLeftIcon, ArrowRightIcon, RefreshIcon, Spinner } from "./icons";

const chip = (on: boolean) =>
  `rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-inset transition ${
    on ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
  }`;

const PREVIEW_ID = "hw-preview";

export default function HandwritingApp() {
  const [level, setLevel] = useState<Level>("sentence");
  const [theme, setTheme] = useState<Theme>("all");
  const [mode, setMode] = useState<Mode>("trace");
  const [font, setFont] = useState<FontKind>("gothic");
  const [cell, setCell] = useState<number>(13);
  const [guide, setGuide] = useState(true);
  const [perPage, setPerPage] = useState(3);
  const [order, setOrder] = useState(0); // 순서 섞기 횟수 (0 이면 기본 순서)
  const [seed, setSeed] = useState<string[] | null>(null);
  const [customText, setCustomText] = useState("");
  const [pageNo, setPageNo] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const options = useMemo<Options>(() => ({ mode, cell, font, guide, perPage }), [mode, cell, font, guide, perPage]);

  const custom = useMemo(() => parsePhrases(customText), [customText]);
  const base = useMemo(() => phrasesFor(level, theme), [level, theme]);
  /** 직접 쓴 문장이 있으면 그것을, 아니면 고른 단계 · 주제의 문구를 (섞었으면 그 순서로) */
  const phrases = useMemo(() => {
    if (custom.length) return custom;
    return seed && order > 0 && seed.length === base.length && seed.every((s) => base.includes(s)) ? seed : base;
  }, [custom, base, seed, order]);

  const pages = useMemo(() => paginate(phrases, options), [phrases, options]);
  const current = Math.min(pageNo, Math.max(pages.length - 1, 0));
  const html = useMemo(() => pages.map((p, i) => pageHtml(p.items, i, options)), [pages, options]);
  const css = useMemo(() => worksheetCss(options, `#${PREVIEW_ID}`), [options]);
  const overflow = pages.some((p) => !p.fits);

  const reset = () => {
    setSeed(null);
    setOrder(0);
    setPageNo(0);
  };

  const shuffle = () => {
    setSeed(shuffled(base));
    setOrder((n) => n + 1);
    setPageNo(0);
  };

  const print = () => {
    const win = window.open("", "_blank"); // 팝업 차단을 피하려고 클릭하자마자 창을 엶
    if (!win) return setPrintError("팝업이 차단되어 인쇄 창을 열 수 없어요.");
    setPrinting(true);
    setPrintError(null);
    try {
      printWorksheet(win, html, options);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">긍정 · 감성 필사 교실</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          마음이 자라는 글을 따라 쓰는 학습지를 만들어요. 글의 길이와 주제, 쓰기 방식을 골라 인쇄해 보세요.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="h-fit space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">1. 글의 길이</legend>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={level === l.id}
                  onClick={() => {
                    setLevel(l.id);
                    reset();
                  }}
                  className={chip(level === l.id)}
                >
                  {l.label}
                  <span className="block text-[11px] font-normal text-slate-400">{l.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">2. 주제</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={theme === t.id}
                  onClick={() => {
                    setTheme(t.id);
                    reset();
                  }}
                  className={chip(theme === t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">3. 쓰기 방식</legend>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {MODES.map((m) => (
                <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={chip(mode === m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{MODES.find((m) => m.id === mode)!.hint}</p>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">4. 글꼴 · 칸</legend>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {FONTS.map((f) => (
                <button key={f.id} type="button" aria-pressed={font === f.id} onClick={() => setFont(f.id)} className={chip(font === f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {CELL_SIZES.map((c) => (
                <button key={c.mm} type="button" aria-pressed={cell === c.mm} onClick={() => setCell(c.mm)} className={`${chip(cell === c.mm)} px-1`}>
                  {c.label}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
              칸 안에 십자 점선 보이기
            </label>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">5. 한 장당 문항 수</legend>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={perPage === n} onClick={() => setPerPage(n)} className={`${chip(perPage === n)} px-1`}>
                  {n}개
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">글이 길면 종이에 맞게 알아서 더 적게 들어가요.</p>
          </fieldset>

          <div>
            <label htmlFor="hw-custom" className="text-sm font-semibold text-slate-800">
              6. 내 문장 직접 쓰기 <span className="font-normal text-slate-400">· 한 줄에 한 문구</span>
            </label>
            <textarea
              id="hw-custom"
              value={customText}
              rows={4}
              placeholder={"비워 두면 위에서 고른 글이 나와요.\n쓰면 그 글로 학습지를 만들어요."}
              onChange={(e) => {
                setCustomText(e.target.value);
                setPageNo(0);
              }}
              className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
            <div className="mt-1.5 flex flex-wrap gap-3 text-xs font-semibold">
              <button type="button" onClick={() => setCustomText(phrases.join("\n"))} className="text-indigo-600 hover:underline">
                지금 문구를 가져와 고치기
              </button>
              {customText && (
                <button type="button" onClick={() => setCustomText("")} className="text-slate-500 hover:underline">
                  지우기
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={print}
              disabled={phrases.length === 0 || printing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {printing && <Spinner className="h-5 w-5" />}
              인쇄 · PDF로 저장 ({pages.length}장)
            </button>
            {printError && (
              <p role="alert" className="text-center text-xs font-medium text-red-600">
                {printError}
              </p>
            )}
          </div>
        </div>

        <section aria-label="학습지 미리보기" className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPageNo(Math.max(current - 1, 0))}
                disabled={current === 0}
                aria-label="이전 쪽"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
              <span className="min-w-16 text-center text-sm font-semibold text-slate-700">
                {pages.length ? current + 1 : 0} / {pages.length}쪽
              </span>
              <button
                type="button"
                onClick={() => setPageNo(Math.min(current + 1, pages.length - 1))}
                disabled={current >= pages.length - 1}
                aria-label="다음 쪽"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={shuffle}
              disabled={custom.length > 0 || base.length < 2}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <RefreshIcon className="h-4 w-4" />
              순서 섞기
            </button>
          </div>

          {overflow && (
            <p role="alert" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              글이 길어 한 장에 다 들어가지 않는 쪽이 있어요. 칸 크기를 줄이거나 글을 나누어 주세요.
            </p>
          )}

          {phrases.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-[15px] text-slate-500">쓸 문구가 없어요.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-5">
              <style>{`@import url("https://fonts.googleapis.com/css2?family=Jua&display=swap");${css}`}</style>
              <div
                id={PREVIEW_ID}
                className="mx-auto w-fit shadow-md"
                style={{ zoom: 0.62 }}
                // pageHtml 은 문구를 XML 이스케이프한 뒤 직접 만든 마크업
                dangerouslySetInnerHTML={{ __html: html[current] ?? "" }}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
