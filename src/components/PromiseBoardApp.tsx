"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { monthWeeks, promiseBoardFileName, WEEKDAYS, type PromiseBoardRequest } from "@/lib/promiseBoard";
import { AlertIcon, DownloadIcon, InfoIcon, RefreshIcon, SparkleIcon, Spinner, XIcon } from "./icons";
import { loadRows } from "./students";

type Board = PromiseBoardRequest & { id: string; url: string; ext: string; usedReference: boolean };

const WEEKDAY_TEXT = ["text-red-500", "", "", "", "", "", "text-blue-600"];
const DAY_DOT = [
  "bg-pink-100 text-red-600",
  "bg-yellow-100",
  "bg-green-100",
  "bg-sky-100",
  "bg-purple-100",
  "bg-orange-100",
  "bg-sky-100 text-blue-700",
];
const WAIT_MESSAGES = [
  "그림을 그리고 있어요",
  "달력에 날짜를 적고 있어요",
  "귀여운 친구들을 그리고 있어요",
  "이름표를 붙이고 있어요",
  "색을 칠하고 있어요",
];

function defaultMonth() {
  const now = new Date();
  // 달의 후반이면 다음 달 약속판을 만드는 경우가 많음
  const d = now.getDate() > 20 ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : now;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function PromiseBoardApp() {
  const [name, setName] = useState("");
  const [{ year, month }, setYm] = useState(defaultMonth);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const urlsRef = useRef<string[]>([]);

  // 시간표에서 입력해 둔 학생 이름을 빠르게 고를 수 있도록
  useEffect(() => {
    const rows = loadRows() ?? [];
    const names = [...new Set(rows.map((r) => r.name.trim()).filter(Boolean))];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 브라우저에서만 읽을 수 있음
    setSavedNames(names);
  }, []);

  // 만든 이미지 주소는 화면을 떠날 때 정리
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  useEffect(() => {
    if (status !== "loading") return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [status]);

  const weeks = useMemo(() => monthWeeks(year, month), [year, month]);
  const thisYear = new Date().getFullYear();
  const selected = boards.find((b) => b.id === selectedId) ?? boards[0];
  const trimmed = name.trim();

  const generate = async (req: PromiseBoardRequest) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus("loading");
    setElapsed(0);
    setError(null);
    try {
      const res = await fetch("/api/promise-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => ({}))) as {
        image?: string;
        mimeType?: string;
        usedReference?: boolean;
        error?: string;
      };
      if (!res.ok || !data.image) throw new Error(data.error || "약속판을 만들지 못했어요. 다시 시도해 주세요.");
      const bytes = Uint8Array.from(atob(data.image), (c) => c.charCodeAt(0));
      const mimeType = data.mimeType || "image/jpeg";
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      urlsRef.current.push(url);
      const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
      const board: Board = { ...req, id: `${Date.now()}`, url, ext, usedReference: !!data.usedReference };
      setBoards((b) => [board, ...b]);
      setSelectedId(board.id);
      setStatus("idle");
    } catch (e) {
      if (ctrl.signal.aborted) return setStatus("idle");
      setError(e instanceof Error ? e.message : "약속판을 만들지 못했어요.");
      setStatus("error");
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStatus("idle");
  };

  const print = (b: Board) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<!doctype html><title>${promiseBoardFileName(b, b.ext).replace(/</g, "")}</title>` +
        `<style>@page{size:A4;margin:8mm}html,body{margin:0;height:100%}img{display:block;width:100%;height:100%;object-fit:contain}</style>` +
        `<img src="${b.url}" onload="setTimeout(()=>{print()},200)">`,
    );
    w.document.close();
  };

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">나와의 약속판 만들기</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          이름과 달을 고르면 Gemini가 같은 모양의 약속판을 그려 줘요.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* 입력 */}
        <form
          className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed && status !== "loading") generate({ name: trimmed, year, month });
          }}
        >
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
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
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

          <p className="mt-5 text-sm font-semibold text-slate-800">날짜</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              aria-label="연도"
              value={year}
              onChange={(e) => setYm({ year: Number(e.target.value), month })}
              className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            >
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <select
              aria-label="월"
              value={month}
              onChange={(e) => setYm({ year, month: Number(e.target.value) })}
              className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </div>

          <MiniCalendar weeks={weeks} year={year} month={month} />

          <button
            type="submit"
            disabled={!trimmed || status === "loading"}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {status === "loading" ? <Spinner className="h-5 w-5" /> : <SparkleIcon className="h-5 w-5" />}
            {status === "loading" ? "만드는 중…" : "약속판 생성하기"}
          </button>
          {!trimmed && <p className="mt-2 text-center text-xs text-slate-400">이름을 입력하면 만들 수 있어요</p>}
        </form>

        {/* 결과 */}
        <section aria-live="polite" className="min-w-0">
          {status === "loading" ? (
            <Generating elapsed={elapsed} name={trimmed} year={year} month={month} onCancel={cancel} />
          ) : status === "error" ? (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <div className="flex-1">
                <p className="font-semibold">약속판을 만들지 못했어요</p>
                <p className="mt-0.5 text-red-700">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => setStatus("idle")}
                aria-label="닫기"
                className="rounded-md p-1 text-red-400 hover:bg-red-100 hover:text-red-600"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          ) : selected ? (
            <Result
              board={selected}
              onRegenerate={() => generate({ name: selected.name, year: selected.year, month: selected.month })}
              onPrint={() => print(selected)}
            />
          ) : (
            <Placeholder />
          )}

          {boards.length > 1 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-slate-700">이번에 만든 약속판</p>
              <ul className="mt-2 flex gap-3 overflow-x-auto pb-2">
                {boards.map((b) => (
                  <li key={b.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(b.id);
                        setStatus("idle");
                      }}
                      className={`block w-24 overflow-hidden rounded-lg border bg-white text-left transition ${
                        b.id === selected?.id ? "border-indigo-400 ring-4 ring-indigo-100" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 blob 주소 */}
                      <img src={b.url} alt="" className="aspect-[3/4] w-full object-cover" />
                      <span className="block truncate px-2 py-1 text-xs font-medium text-slate-700">
                        {b.name} · {b.month}월
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MiniCalendar({ weeks, year, month }: { weeks: (number | null)[][]; year: number; month: number }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-500">
        {year}년 {month}월 달력 <span className="font-normal text-slate-400">· 생성된 그림과 비교해 보세요</span>
      </p>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((d, i) => (
          <span key={d} className={`py-0.5 font-semibold text-slate-500 ${WEEKDAY_TEXT[i]}`}>
            {d}
          </span>
        ))}
        {weeks.flatMap((week, w) =>
          week.map((d, i) => (
            <span key={`${w}-${i}`} className="grid h-7 place-items-center">
              {d && (
                <span className={`grid h-6 w-6 place-items-center rounded-full font-semibold text-slate-700 ${DAY_DOT[i]}`}>
                  {d}
                </span>
              )}
            </span>
          )),
        )}
      </div>
    </div>
  );
}

function Placeholder() {
  return (
    <div className="flex aspect-[3/4] max-h-[70vh] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 p-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-pink-50 text-2xl" aria-hidden="true">
        🌈
      </span>
      <p className="mt-4 font-semibold text-slate-700">여기에 약속판이 나타나요</p>
      <p className="mt-1 text-sm text-slate-500">이름과 달을 고른 뒤 &lsquo;약속판 생성하기&rsquo;를 눌러 주세요.</p>
    </div>
  );
}

function Generating({
  elapsed,
  name,
  year,
  month,
  onCancel,
}: {
  elapsed: number;
  name: string;
  year: number;
  month: number;
  onCancel: () => void;
}) {
  const message = WAIT_MESSAGES[Math.floor(elapsed / 6) % WAIT_MESSAGES.length];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mx-auto max-w-sm">
        <div className="shimmer relative aspect-[3/4] overflow-hidden rounded-xl bg-gradient-to-b from-pink-50 to-sky-50 p-5">
          <div className="mx-auto h-6 w-2/3 rounded-full bg-pink-200/70" />
          <div className="mx-auto mt-2 h-3 w-1/2 rounded-full bg-pink-100" />
          <div className="mt-5 grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => (
              <div
                key={i}
                className="cell-fill aspect-square rounded bg-white/90"
                style={{ animationDelay: `${(i % 7) * 0.1 + Math.floor(i / 7) * 0.15}s` }}
              />
            ))}
          </div>
          <div className="mt-4 h-12 rounded-lg bg-amber-50" />
        </div>
      </div>
      <div className="mt-5 text-center">
        <p className="flex items-center justify-center gap-2 font-semibold text-slate-900">
          <Spinner className="h-5 w-5 text-indigo-600" />
          {message}…
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {name}의 {year}년 {month}월 약속판 · {elapsed}초 지남 (보통 20~60초 걸려요)
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function Result({ board, onRegenerate, onPrint }: { board: Board; onRegenerate: () => void; onPrint: () => void }) {
  return (
    <div className="fade-up">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-slate-900">
          {board.name}
          <span className="ml-2 text-sm font-normal text-slate-500">
            {board.year}년 {board.month}월 약속판
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshIcon className="h-4 w-4" />
            다시 생성
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            인쇄
          </button>
          <a
            href={board.url}
            download={promiseBoardFileName(board, board.ext)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <DownloadIcon className="h-4 w-4" />
            다운로드
          </a>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 blob 주소 */}
        <img
          src={board.url}
          alt={`${board.name}의 ${board.year}년 ${board.month}월 나와의 약속판`}
          className="mx-auto max-h-[80vh] w-auto rounded-md bg-white shadow-md"
        />
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        AI가 그린 그림이라 날짜나 글자가 틀릴 수 있어요. 왼쪽 달력과 비교해 보고, 틀리면 &lsquo;다시 생성&rsquo;을 눌러 주세요.
        {!board.usedReference && " (참고 이미지가 없어 설명만으로 그렸어요.)"}
      </p>
    </div>
  );
}
