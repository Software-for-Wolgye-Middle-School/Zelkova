"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { NOTICE_BOARD_URL, type MealCell, type MealFile, type MealNotice, type MealTable } from "@/lib/meal";
import { AlertIcon, ArrowRightIcon, DownloadIcon, RefreshIcon, Spinner } from "./icons";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; notices: MealNotice[] };

const fileUrl = (f: MealFile, inline = false) =>
  `/api/meals/file?${new URLSearchParams({ id: f.id, sn: f.sn, name: f.name, ...(inline ? { inline: "1" } : {}) })}`;

/** '2025년 12월 ~ 2026년 1월 급식가정통신문' → { year: 2025, months: '12월 ~ 1월' } */
function noticeMonths(title: string) {
  const m = /(\d{4})\s*년\s*(.*\d\s*월)/.exec(title);
  if (!m) return { year: null, months: title };
  return { year: Number(m[1]), months: m[2].replace(/\d{4}\s*년\s*/g, "").trim() };
}

export default function MealApp() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [selected, setSelected] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/meals");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setState({ status: "ready", notices: data.notices });
      setSelected(0);
    } catch (e) {
      setState({ status: "error", message: e instanceof Error && e.message ? e.message : "급식 안내를 가져오지 못했어요." });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 화면을 열면 학교 홈페이지에서 바로 불러옴
    load();
  }, [load]);

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">급식표 조회하기</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          월계중학교 가정통신문에 올라온 급식 안내를 매달 자동으로 가져와요. 최근 3번의 안내를 볼 수 있어요.
        </p>
      </div>

      {state.status === "loading" && (
        <div className="flex flex-col items-center gap-3 py-20 text-slate-500" role="status">
          <Spinner className="h-8 w-8 text-indigo-600" />
          <p className="text-[15px]">월계중학교 홈페이지에서 급식 안내를 가져오고 있어요…</p>
        </div>
      )}

      {state.status === "error" && (
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertIcon className="h-8 w-8 text-red-500" />
          <p className="text-[15px] font-medium text-red-700">{state.message}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              <RefreshIcon className="h-4 w-4" />
              다시 시도
            </button>
            <a
              href={NOTICE_BOARD_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              가정통신문 게시판 열기
            </a>
          </div>
        </div>
      )}

      {state.status === "ready" &&
        (state.notices.length === 0 ? (
          <p className="py-16 text-center text-[15px] text-slate-500">가정통신문 게시판에서 급식 안내를 찾지 못했어요.</p>
        ) : (
          <>
            <div role="tablist" aria-label="급식 안내 달 고르기" className="mb-5 flex flex-wrap justify-center gap-2">
              {state.notices.map((n, i) => {
                const { year, months } = noticeMonths(n.title);
                return (
                  <button
                    key={n.nttId}
                    type="button"
                    role="tab"
                    id={`meal-tab-${n.nttId}`}
                    aria-selected={selected === i}
                    aria-controls="meal-panel"
                    onClick={() => setSelected(i)}
                    className={`rounded-full px-5 py-2.5 text-[15px] font-semibold ring-1 ring-inset transition ${
                      selected === i ? "bg-indigo-600 text-white ring-indigo-600 shadow-sm shadow-indigo-600/30" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {year && <span className={`mr-1 text-xs font-medium ${selected === i ? "text-indigo-200" : "text-slate-400"}`}>{year}년</span>}
                    {months}
                  </button>
                );
              })}
            </div>
            <NoticePanel notice={state.notices[selected]} />
          </>
        ))}
    </div>
  );
}

function NoticePanel({ notice }: { notice: MealNotice }) {
  const pdf = notice.files.find((f) => f.ext === "pdf");
  return (
    <section id="meal-panel" role="tabpanel" aria-labelledby={`meal-tab-${notice.nttId}`} className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{notice.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {notice.date} 게시 ·{" "}
            <a href={NOTICE_BOARD_URL} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">
              가정통신문 게시판
              <ArrowRightIcon className="ml-0.5 inline h-3.5 w-3.5" />
            </a>
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {notice.files.map((f) => (
            <a
              key={`${f.id}-${f.sn}`}
              href={fileUrl(f)}
              download={f.name}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700"
            >
              <DownloadIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{f.name}</span>
            </a>
          ))}
        </div>
      </div>

      {notice.tables.length > 0 ? (
        notice.tables.map((t, i) => <MealCalendar key={i} table={t} fallbackTitle={notice.title} />)
      ) : pdf ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
          <iframe src={fileUrl(pdf, true)} title={`${notice.title} 미리보기`} className="block h-[80vh] w-full bg-white" />
          <p className="px-4 py-3 text-center text-sm text-slate-500">
            미리보기가 보이지 않으면{" "}
            <a href={fileUrl(pdf, true)} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline">
              새 창에서 열어
            </a>{" "}
            주세요.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-[15px] text-slate-500">
          이 안내문에서는 식단표를 읽지 못했어요. 위의 버튼으로 파일을 내려받아 확인해 주세요.
        </p>
      )}
    </section>
  );
}

function MealCalendar({ table, fallbackTitle }: { table: MealTable; fallbackTitle: string }) {
  const now = new Date();
  const isThisMonth = table.year === now.getFullYear() && table.month === now.getMonth() + 1;
  const cols = { "--cols": Math.max(table.weekdays.length, 1) } as CSSProperties;
  const gridCols = "grid gap-2 sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))]";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 text-center text-xl font-bold tracking-tight text-slate-900">{table.title || fallbackTitle}</h3>
      <div className={`${gridCols} mb-2 hidden sm:grid`} style={cols} aria-hidden="true">
        {table.weekdays.map((w, i) => (
          <div key={i} className="rounded-lg bg-slate-50 py-2 text-center text-sm font-bold text-slate-700">
            {w}
          </div>
        ))}
      </div>
      <div className="space-y-4">
        {table.weeks.map((week, i) => (
          <div key={i}>
            <div className={gridCols} style={cols}>
              {week.cells.map((cell) => (
                <MealCellView key={cell.col} cell={cell} today={isThisMonth && cell.kind === "day" && Number(cell.date) === now.getDate()} />
              ))}
            </div>
            {week.nutrition && <p className="mt-1.5 text-right text-xs text-slate-400">영양량 · {week.nutrition}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MealCellView({ cell, today }: { cell: MealCell; today: boolean }) {
  const place = { "--gc": cell.kind === "note" ? `${cell.col} / span ${cell.span}` : `${cell.col}` } as CSSProperties;
  const placeClass = "sm:[grid-column:var(--gc)]";

  if (cell.kind === "note") {
    return (
      <div style={place} className={`${placeClass} rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500`}>
        {cell.lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
    );
  }

  const noMeal = cell.items.length <= 1 && !cell.items[0]?.allergens;
  return (
    <div
      style={place}
      aria-current={today ? "date" : undefined}
      className={`${placeClass} flex flex-col rounded-xl border p-3 ${today ? "border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200" : "border-slate-200"}`}
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-1.5">
        <span className={`text-lg font-bold ${today ? "text-indigo-700" : "text-slate-900"}`}>{cell.date}</span>
        <span className="text-sm font-semibold text-slate-500">{cell.weekday}</span>
        {today && <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[11px] font-bold text-white">오늘</span>}
        {cell.dateNote && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">{cell.dateNote}</span>}
        {cell.weekdayNote && <span className="w-full text-[11px] text-pink-500 sm:hidden">{cell.weekdayNote}</span>}
      </div>
      {noMeal ? (
        <p className="flex flex-1 items-center justify-center py-3 text-sm font-semibold text-slate-400">{cell.items[0]?.name ?? "급식 없음"}</p>
      ) : (
        <ul className="space-y-1 text-[14px] leading-snug text-slate-800 [overflow-wrap:anywhere]">
          {cell.items.map((item, i) => (
            <li key={i}>
              {item.name}
              {item.allergens && <span className="ml-1 text-[10px] text-slate-400">{item.allergens}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
