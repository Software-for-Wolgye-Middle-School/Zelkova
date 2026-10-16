"use client";

import { useEffect, useMemo, useState } from "react";
import { promiseBoardFileName, type PromiseBoardRequest } from "@/lib/promiseBoard";
import { boardPng, boardSvg, printBoard } from "@/lib/promiseBoardSvg";
import { DownloadIcon, Spinner } from "./icons";
import { loadRows } from "./students";

/** 고를 수 있는 연도: 2026년 ~ 2036년 */
const BOARD_YEARS = Array.from({ length: 11 }, (_, i) => 2026 + i);

function defaultMonth() {
  const now = new Date();
  // 달의 후반이면 다음 달 약속판을 만드는 경우가 많음
  const d = now.getDate() > 20 ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : now;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

export default function PromiseBoardApp() {
  const [name, setName] = useState("");
  const [{ year, month }, setYm] = useState(defaultMonth);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [busy, setBusy] = useState<"png" | "print" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // 시간표에서 입력해 둔 학생 이름을 빠르게 고를 수 있도록
  useEffect(() => {
    const rows = loadRows() ?? [];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 브라우저에서만 읽을 수 있음
    setSavedNames([...new Set(rows.map((r) => r.name.trim()).filter(Boolean))]);
  }, []);

  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 12);
  const req: PromiseBoardRequest = { name: trimmed || "○○○", year, month };
  const svg = useMemo(() => boardSvg({ name: trimmed || "○○○", year, month }), [trimmed, year, month]);

  const downloadPng = async () => {
    setBusy("png");
    setExportError(null);
    try {
      const blob = await boardPng(req);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = promiseBoardFileName(req, "png");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error(e);
      setExportError("그림 파일로 저장하지 못했어요. 인쇄 버튼으로 PDF 저장을 이용해 주세요.");
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    const win = window.open("", "_blank"); // 팝업 차단을 피하려고 클릭하자마자 창을 엶
    if (!win) return setExportError("팝업이 차단되어 인쇄 창을 열 수 없어요.");
    setBusy("print");
    try {
      await printBoard(req, win);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">나와의 약속판 만들기</h1>
        <p className="mt-2 text-[15px] text-slate-500">이름과 달을 고르면 바로 약속판이 만들어져요. 무료로 바로 인쇄할 수 있어요.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="h-fit space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-6">
          <div>
            <label className="block text-sm font-semibold text-slate-800" htmlFor="pb-name">
              이름
            </label>
            <input
              id="pb-name"
              value={name}
              maxLength={12}
              autoComplete="off"
              placeholder="예: 강동아"
              onChange={(e) => setName(e.target.value)}
              className={`mt-2 ${field}`}
            />
            {savedNames.length > 0 && (
              <div className="mt-2.5">
                <p className="text-xs text-slate-400">시간표에 입력한 학생</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {savedNames.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setName(n)}
                      aria-pressed={trimmed === n}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                        trimmed === n
                          ? "bg-indigo-50 text-indigo-700 ring-indigo-300"
                          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-800">날짜</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select aria-label="연도" value={year} onChange={(e) => setYm({ year: Number(e.target.value), month })} className={field}>
                {BOARD_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
              <select aria-label="월" value={month} onChange={(e) => setYm({ year, month: Number(e.target.value) })} className={field}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={downloadPng}
              disabled={!trimmed || busy !== null}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {busy === "png" ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
              그림 파일로 저장 (PNG)
            </button>
            <button
              type="button"
              onClick={print}
              disabled={!trimmed || busy !== null}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {busy === "print" && <Spinner className="h-5 w-5" />}
              인쇄 · PDF로 저장
            </button>
            {!trimmed && <p className="text-center text-xs text-slate-400">이름을 입력하면 저장할 수 있어요</p>}
            {exportError && (
              <p role="alert" className="text-center text-xs font-medium text-red-600">
                {exportError}
              </p>
            )}
          </div>
        </div>

        <section aria-label="약속판 미리보기" className="min-w-0">
          <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-6">
            <div
              className="mx-auto max-w-[620px] overflow-hidden rounded-md bg-white shadow-md [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              role="img"
              aria-label={`${req.name}의 ${year}년 ${month}월 나와의 약속판 미리보기`}
              // boardSvg 는 이름을 XML 이스케이프한 뒤 직접 만든 SVG 문자열
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
