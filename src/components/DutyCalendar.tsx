"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hasEntries, isoOf, logRange, mondayOf } from "@/lib/dutyLogSvg";
import { byTime, EVENT_MEMO_MAX, EVENT_TITLE_MAX, type DutyEvent } from "@/lib/dutyEvents";
import type { DutyDocs, EventDocs } from "./dutyLogSync";
import { newEventId } from "./dutyLogSync";
import { STATUS_TEXT, type Status } from "./useDutySync";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** 한 칸에 보여 주는 일정 수 (넘으면 "+N개") */
const MAX_CHIPS = 3;
/** 활동일지 막대 한 줄의 높이와 간격 (rem) */
const BAR_H = 1.25;
const BAR_STEP = 1.4;
/** 칸 맨 위 날짜 숫자 아래에서 막대가 시작하는 자리 (rem) */
const BAR_TOP = 1.9;
/** 말풍선 너비(px) — 위치를 정할 때도 씀 */
const POP_W = 352;
const POP_H = 440;
const TIP_KEY = "zelkova:duty-calendar-tip";
const UNDO_MS = 7000;

/** 2026-11-09 → 11/9 */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}`;
const label = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
};
const pad = (n: number) => String(n).padStart(2, "0");

/** 쓴 활동일지 하나: key 는 그 주 월요일 날짜, start ~ end 는 양식에 적은 날짜 */
type LogItem = { key: string; start: string; end: string; signed: boolean };

/** 누른 자리 옆에 띄우는 말풍선: 만들기 · 보기 · 고치기 · 그날 일정 목록 */
type Pop = { mode: "create" | "view" | "edit" | "day"; date: string; eventId?: string; left: number; top: number };

type Props = {
  weeks: DutyDocs;
  events: EventDocs;
  status: Status;
  onOpenWeek: (monday: string) => void;
  onSaveEvent: (event: DutyEvent) => void;
  onRemoveEvent: (id: string) => void;
};

/** 활동일지 첫 화면: 구글 캘린더처럼 달력에 일정과 작성한 활동일지를 보여 줌. 날짜를 누르면 그 옆에 말풍선이 떠서 바로 일정을 만듦 */
export default function DutyCalendar({ weeks, events, status, onOpenWeek, onSaveEvent, onRemoveEvent }: Props) {
  const [today] = useState(() => isoOf(new Date()));
  const [month, setMonth] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { y, m };
  });
  const [pop, setPop] = useState<Pop | null>(null);
  /** 목록에서 눌러 달력이 옮겨 간 활동일지 (막대를 잠깐 강조) */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  /** 지운 직후 '실행취소'를 보여 주는 안내 */
  const [undo, setUndo] = useState<DutyEvent | null>(null);
  const [tipHidden, setTipHidden] = useState(() => {
    try {
      return localStorage.getItem(TIP_KEY) === "1";
    } catch {
      return false;
    }
  });
  /** 말풍선 위치의 기준이 되는 달력 영역 */
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  useEffect(() => {
    if (!focusKey) return;
    const t = setTimeout(() => setFocusKey(null), 2500);
    return () => clearTimeout(t);
  }, [focusKey]);

  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pop]);

  const byDate = useMemo(() => {
    const map: Record<string, DutyEvent[]> = {};
    for (const doc of Object.values(events)) {
      if (doc.event) (map[doc.event.date] ??= []).push(doc.event);
    }
    for (const list of Object.values(map)) list.sort(byTime);
    return map;
  }, [events]);
  const eventCount = useMemo(() => Object.values(events).filter((d) => d.event).length, [events]);

  /** 쓴 활동일지들 (적은 날짜 순) */
  const logs = useMemo<LogItem[]>(
    () =>
      Object.keys(weeks)
        .filter((k) => hasEntries(weeks[k].log))
        .map((key) => ({ key, ...logRange(key, weeks[key].log), signed: weeks[key].log.signed }))
        .sort((a, b) => a.start.localeCompare(b.start) || a.key.localeCompare(b.key)),
    [weeks],
  );

  /** 어떤 활동일지가 다루는 날짜면 그 활동일지 */
  const logOn = (date: string) => logs.find((l) => l.start <= date && date <= l.end);

  // 그 달을 덮는 주(일요일 시작)들
  const rows = useMemo(() => {
    const first = new Date(month.y, month.m - 1, 1);
    const days = new Date(month.y, month.m, 0).getDate();
    const start = new Date(month.y, month.m - 1, 1 - first.getDay());
    const count = Math.ceil((first.getDay() + days) / 7);
    return Array.from({ length: count }, (_, r) =>
      Array.from({ length: 7 }, (_, c) => isoOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + r * 7 + c))),
    );
  }, [month]);

  /** 그 줄(주)에 걸친 활동일지 막대들: 이어지는 날짜를 한 덩어리로 (겹치면 아래 줄에 쌓음) */
  const barsOf = (row: string[]) => {
    const lanes: number[] = [];
    const bars: { item: LogItem; col: number; span: number; lane: number; fromStart: boolean; toEnd: boolean }[] = [];
    for (const item of logs) {
      if (item.end < row[0] || item.start > row[6]) continue;
      const col = row.findIndex((d) => d >= item.start);
      const from = col < 0 ? 0 : col;
      const last = row.reduce((n, d, i) => (d <= item.end ? i : n), -1);
      const lane = lanes.findIndex((end) => end < from);
      const useLane = lane < 0 ? lanes.length : lane;
      lanes[useLane] = last;
      bars.push({ item, col: from, span: last - from + 1, lane: useLane, fromStart: item.start >= row[0], toEnd: item.end <= row[6] });
    }
    return { bars, laneCount: lanes.length };
  };

  /** 왼쪽 목록: 연도 → 월 → 활동일지 (최근이 앞). 월은 시작일이 있는 달 */
  const tree = useMemo(() => {
    const years: Record<string, Record<string, LogItem[]>> = {};
    for (const item of logs) ((years[item.start.slice(0, 4)] ??= {})[item.start.slice(5, 7)] ??= []).push(item);
    return Object.entries(years)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, months]) => ({
        year,
        count: Object.values(months).reduce((n, l) => n + l.length, 0),
        months: Object.entries(months)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([m, list]) => ({ month: Number(m), list: [...list].reverse() })),
      }));
  }, [logs]);

  const move = (delta: number) => {
    setPop(null);
    setMonth(({ y, m }) => {
      const d = new Date(y, m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  };
  /** 목록에서 고른 활동일지가 있는 달로 달력을 옮기고 그 막대를 강조 */
  const showLog = (item: LogItem) => {
    const [y, m] = item.start.split("-").map(Number);
    setPop(null);
    setMonth({ y, m });
    setFocusKey(item.key);
  };
  const goToday = () => {
    setPop(null);
    const [y, m] = today.split("-").map(Number);
    setMonth({ y, m });
  };

  /** 누른 것(칸 · 일정 · 단추) 바로 옆에 말풍선을 띄움: 오른쪽에 자리가 없으면 왼쪽에, 아래가 모자라면 위로 올림 */
  const openPop = (e: React.MouseEvent<HTMLElement>, mode: Pop["mode"], date: string, eventId?: string) => {
    const area = areaRef.current?.getBoundingClientRect();
    if (!area) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fitsRight = area.right - r.right >= POP_W + 12;
    const left = fitsRight ? r.right - area.left + 6 : Math.max(0, r.left - area.left - POP_W - 6);
    const top = Math.min(Math.max(0, r.top - area.top - 8), Math.max(0, area.height - POP_H));
    setPop({ mode, date, eventId, left, top });
  };

  const hideTip = () => {
    setTipHidden(true);
    try {
      localStorage.setItem(TIP_KEY, "1");
    } catch {
      // 저장하지 못해도 이번 화면에서는 숨김
    }
  };

  const remove = (ev: DutyEvent) => {
    onRemoveEvent(ev.id);
    setUndo(ev);
    setPop(null);
  };

  const popEvent = pop?.eventId ? events[pop.eventId]?.event ?? undefined : undefined;

  return (
    <div className="fade-up mx-auto max-w-6xl">
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">특수교육실무사 활동일지</h1>
        <p className="mt-2 text-[15px] text-slate-500">달력에서 날짜를 눌러 일정을 만들고, 초록 막대를 눌러 활동일지를 열어요.</p>
      </div>

      {!tipHidden && (
        <div className="mx-auto mb-5 max-w-3xl rounded-2xl bg-indigo-50 p-4 ring-1 ring-inset ring-indigo-200">
          <p className="text-sm font-bold text-indigo-900">처음이세요? 이렇게 쓰면 돼요</p>
          <ol className="mt-2 space-y-1 text-sm text-indigo-900/90">
            <li>
              <b>1.</b> 달력에서 <b>날짜 칸을 누르면</b> 그 옆에 작은 창이 떠요. 제목만 쓰고 Enter를 누르면 일정이 저장돼요.
            </li>
            <li>
              <b>2.</b> 창 위쪽의 <b>「활동일지」</b> 탭이나 아래 <b>「활동일지 쓰기」</b> 단추로 그 날짜의 활동일지를 써요.
            </li>
            <li>
              <b>3.</b> 만든 일정을 누르면 <b>고치기 · 삭제</b>를 할 수 있고, 잘못 지워도 바로 <b>실행취소</b>할 수 있어요.
            </li>
          </ol>
          <button type="button" onClick={hideTip} className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700">
            알겠어요
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside aria-label="연도별 활동일지" className="h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-4">
          <h2 className="mb-2 px-1 text-sm font-bold text-slate-800">등록된 활동일지</h2>
          {tree.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs leading-relaxed text-slate-400">아직 쓴 활동일지가 없어요. 날짜를 눌러 「활동일지」 탭에서 써 보세요.</p>
          ) : (
            <div className="max-h-[28rem] space-y-1 overflow-y-auto pr-0.5">
              {tree.map(({ year, count, months }) => (
                <details key={year} open={year === String(month.y) || tree.length === 1} className="group rounded-lg">
                  <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                    <span>{year}년</span>
                    <span className="flex items-center gap-1.5 text-xs font-normal text-slate-400">
                      {count}개<span className="inline-block transition group-open:rotate-90">›</span>
                    </span>
                  </summary>
                  <div className="mb-1 mt-0.5 space-y-1.5 pl-2">
                    {months.map(({ month: m, list }) => (
                      <section key={m}>
                        <h3 className="px-2 text-xs font-bold text-slate-500">{m}월</h3>
                        <ul className="mt-0.5 space-y-0.5">
                          {list.map((item) => (
                            <li key={item.key} className={`flex items-center gap-1 rounded-md transition ${focusKey === item.key ? "bg-emerald-50" : ""}`}>
                              <button
                                type="button"
                                onClick={() => showLog(item)}
                                title="눌러서 달력에서 이 날짜로 이동"
                                className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-800"
                              >
                                <span>
                                  {md(item.start)} ~ {md(item.end)}
                                </span>
                                {item.signed && <span className="rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700">서명</span>}
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenWeek(item.key)}
                                aria-label={`${md(item.start)} ~ ${md(item.end)} 활동일지 열기`}
                                title="활동일지 열기"
                                className="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                              >
                                열기
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </aside>

        <div ref={areaRef} className="relative min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={goToday} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50">
                오늘
              </button>
              <button type="button" onClick={() => move(-1)} aria-label="이전 달" className="grid h-9 w-9 place-items-center rounded-full text-lg text-slate-600 transition hover:bg-slate-100">
                ‹
              </button>
              <button type="button" onClick={() => move(1)} aria-label="다음 달" className="grid h-9 w-9 place-items-center rounded-full text-lg text-slate-600 transition hover:bg-slate-100">
                ›
              </button>
              <h2 className="ml-1 text-xl font-bold text-slate-900" aria-live="polite">
                {month.y}년 {month.m}월
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={(e) => openPop(e, "create", today)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow ring-1 ring-slate-200 transition hover:bg-slate-50 hover:shadow-md"
              >
                <span className="text-lg leading-none text-indigo-600">＋</span> 일정 만들기
              </button>
              <button
                type="button"
                onClick={() => onOpenWeek(logOn(today)?.key ?? mondayOf(today))}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-600/30 transition hover:bg-emerald-700"
              >
                이번 주 활동일지 쓰기
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className={`py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-sky-600" : "text-slate-500"}`}>
                  {w}
                </div>
              ))}
            </div>
            {rows.map((row) => {
              const { bars, laneCount } = barsOf(row);
              return (
                <div key={row[0]} className="relative grid grid-cols-7">
                  {row.map((date, dow) => {
                    const inMonth = date.startsWith(`${month.y}-${pad(month.m)}`);
                    const list = byDate[date] ?? [];
                    const shown = list.slice(0, MAX_CHIPS);
                    const more = list.length - shown.length;
                    const covered = !!logOn(date);
                    const selected = pop?.date === date && (pop.mode === "create" || pop.mode === "day");
                    return (
                      <div key={date} className={`relative min-h-[5.5rem] border-b border-r border-slate-100 sm:min-h-[7rem] ${selected ? "bg-indigo-50/60" : inMonth ? "bg-white" : "bg-slate-50/70"}`}>
                        <button
                          type="button"
                          onClick={(e) => openPop(e, "create", date)}
                          aria-label={`${label(date)} 일정 만들기${covered ? " (활동일지 작성됨)" : ""}`}
                          title="눌러서 일정 만들기"
                          className="group absolute inset-0 cursor-pointer transition hover:bg-indigo-50/50 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                        >
                          <span aria-hidden="true" className="absolute right-1 top-1 hidden h-5 w-5 place-items-center rounded-full bg-indigo-600 text-sm leading-none text-white group-hover:grid">
                            +
                          </span>
                        </button>
                        <div className="pointer-events-none relative flex h-full flex-col gap-0.5 p-1">
                          <span
                            className={`mb-0.5 grid h-6 w-6 place-items-center self-start rounded-full text-xs font-semibold ${
                              date === today ? "bg-indigo-600 text-white" : !inMonth ? "text-slate-300" : dow === 0 ? "text-red-500" : dow === 6 ? "text-sky-600" : "text-slate-700"
                            }`}
                          >
                            {Number(date.slice(8))}
                          </span>
                          {/* 활동일지 막대가 지나가는 자리 */}
                          {laneCount > 0 && <div style={{ height: `${laneCount * BAR_STEP - 0.15}rem` }} aria-hidden="true" />}
                          {shown.map((ev) => (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={(e) => openPop(e, "view", date, ev.id)}
                              title={`${ev.time ? `${ev.time} ` : ""}${ev.title}`}
                              className={`pointer-events-auto flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold transition ${
                                ev.time ? "text-slate-700 hover:bg-slate-100" : "bg-indigo-600 text-white hover:bg-indigo-700"
                              }`}
                            >
                              {ev.time && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-indigo-600" />}
                              {ev.time && <span className="shrink-0 font-normal text-slate-500">{ev.time}</span>}
                              <span className="truncate">{ev.title}</span>
                            </button>
                          ))}
                          {more > 0 && (
                            <button type="button" onClick={(e) => openPop(e, "day", date)} className="pointer-events-auto self-start rounded px-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">
                              +{more}개 더보기
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* 이어지는 날짜는 막대 하나로 */}
                  {bars.map(({ item, col, span, lane, fromStart, toEnd }) => (
                    <button
                      key={`${item.key}-${col}`}
                      type="button"
                      onClick={() => onOpenWeek(item.key)}
                      title={`활동일지 ${md(item.start)} ~ ${md(item.end)} — 눌러서 열기`}
                      className={`absolute z-[1] truncate bg-emerald-600 px-2 text-left text-[11px] font-semibold leading-5 text-white transition hover:bg-emerald-700 ${focusKey === item.key ? "ring-2 ring-emerald-300 ring-offset-1" : ""} ${fromStart ? "rounded-l-md" : ""} ${toEnd ? "rounded-r-md" : ""}`}
                      style={{
                        left: `calc(${(col / 7) * 100}% + ${fromStart ? 4 : 0}px)`,
                        width: `calc(${(span / 7) * 100}% - ${(fromStart ? 4 : 0) + (toEnd ? 4 : 0)}px)`,
                        top: `${BAR_TOP + lane * BAR_STEP}rem`,
                        height: `${BAR_H}rem`,
                      }}
                    >
                      활동일지 {md(item.start)} ~ {md(item.end)}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {eventCount === 0 && logs.length === 0 && tipHidden && <p className="mt-3 text-center text-sm text-slate-400">날짜 칸을 눌러 첫 일정을 만들어 보세요.</p>}
          <p aria-live="polite" className={`mt-3 text-center text-xs font-medium ${STATUS_TEXT[status].tone}`}>
            {STATUS_TEXT[status].text}
          </p>

          {pop && (
            <>
              {/* 말풍선 밖을 누르면 닫힘 */}
              <div className="fixed inset-0 z-40" onClick={() => setPop(null)} aria-hidden="true" />
              <div
                role="dialog"
                aria-label={pop.mode === "view" ? "일정 보기" : pop.mode === "day" ? `${label(pop.date)} 일정 목록` : pop.mode === "edit" ? "일정 고치기" : "일정 만들기"}
                style={{ ["--l" as string]: `${pop.left}px`, ["--t" as string]: `${pop.top}px`, width: undefined }}
                className="fade-up fixed inset-x-3 bottom-3 z-50 max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-200 sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-[var(--l)] sm:top-[var(--t)] sm:w-[22rem]"
              >
                {pop.mode === "view" && popEvent ? (
                  <ViewCard
                    event={popEvent}
                    onClose={() => setPop(null)}
                    onEdit={() => setPop({ ...pop, mode: "edit" })}
                    onDelete={() => remove(popEvent)}
                  />
                ) : pop.mode === "day" ? (
                  <DayList
                    date={pop.date}
                    list={byDate[pop.date] ?? []}
                    onClose={() => setPop(null)}
                    onPick={(id) => setPop({ ...pop, mode: "view", eventId: id })}
                    onAdd={() => setPop({ ...pop, mode: "create", eventId: undefined })}
                  />
                ) : (
                  <EventForm
                    key={`${pop.mode}-${pop.eventId ?? pop.date}`}
                    mode={pop.mode === "edit" ? "edit" : "create"}
                    date={pop.date}
                    event={pop.mode === "edit" ? popEvent : undefined}
                    log={logOn(pop.date)}
                    onClose={() => setPop(null)}
                    onSave={(ev) => {
                      onSaveEvent(ev);
                      setPop(null);
                    }}
                    onOpenLog={(key) => onOpenWeek(key)}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {undo && (
        <div role="status" className="fade-up fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-800 px-4 py-3 text-sm text-white shadow-xl">
          <span>
            ‘{undo.title}’ 일정을 삭제했어요.
          </span>
          <button
            type="button"
            onClick={() => {
              onSaveEvent(undo);
              setUndo(null);
            }}
            className="font-bold text-indigo-300 hover:text-indigo-200"
          >
            실행취소
          </button>
          <button type="button" onClick={() => setUndo(null)} aria-label="닫기" className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

const iconBtn = "grid h-8 w-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800";

/** 일정을 눌렀을 때: 내용 보기 + 고치기 · 삭제 · 닫기 */
function ViewCard({ event, onClose, onEdit, onDelete }: { event: DutyEvent; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-0.5">
        <button type="button" onClick={onEdit} title="고치기" aria-label="일정 고치기" className={iconBtn}>
          ✎
        </button>
        <button type="button" onClick={onDelete} title="삭제" aria-label="일정 삭제" className={`${iconBtn} hover:bg-red-50 hover:text-red-600`}>
          🗑
        </button>
        <button type="button" onClick={onClose} title="닫기" aria-label="닫기" className={iconBtn}>
          ✕
        </button>
      </div>
      <div className="flex gap-3 px-1">
        <span aria-hidden="true" className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded bg-indigo-600" />
        <div className="min-w-0">
          <h3 className="break-words text-xl font-bold text-slate-900">{event.title}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {label(event.date)}
            {event.time ? ` · ${event.time}` : " · 종일"}
          </p>
          {event.memo && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">{event.memo}</p>}
        </div>
      </div>
    </div>
  );
}

/** 그 날의 일정이 많을 때 (+N개 더보기) 전체 목록 */
function DayList({ date, list, onClose, onPick, onAdd }: { date: string; list: DutyEvent[]; onClose: () => void; onPick: (id: string) => void; onAdd: () => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900">{label(date)}</h3>
        <button type="button" onClick={onClose} aria-label="닫기" className={iconBtn}>
          ✕
        </button>
      </div>
      <ul className="space-y-1">
        {list.map((ev) => (
          <li key={ev.id}>
            <button type="button" onClick={() => onPick(ev.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-100">
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-600" />
              {ev.time && <span className="font-normal text-slate-500">{ev.time}</span>}
              <span className="truncate">{ev.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onAdd} className="mt-3 rounded-lg px-3 py-1.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50">
        ＋ 일정 더 만들기
      </button>
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/**
 * 일정 만들기 · 고치기 말풍선. 제목만 쓰고 Enter(또는 저장)면 끝나고, 시간 · 설명은 필요할 때만 펼침.
 * 만들 때는 위쪽 탭으로 그 날짜의 활동일지 쓰기로 바꿀 수 있음
 */
function EventForm({
  mode,
  date: initialDate,
  event,
  log,
  onClose,
  onSave,
  onOpenLog,
}: {
  mode: "create" | "edit";
  date: string;
  event?: DutyEvent;
  /** 이 날짜를 다루는 활동일지 (없으면 undefined) */
  log?: LogItem;
  onClose: () => void;
  onSave: (event: DutyEvent) => void;
  onOpenLog: (key: string) => void;
}) {
  const [tab, setTab] = useState<"event" | "log">("event");
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? initialDate);
  const [time, setTime] = useState(event?.time ?? "");
  const [memo, setMemo] = useState(event?.memo ?? "");
  const [showTime, setShowTime] = useState(!!event?.time);
  const [showMemo, setShowMemo] = useState(!!event?.memo);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // 제목을 안 써도 저장됨 (구글 캘린더처럼 「제목 없음」)
    onSave({ id: event?.id ?? newEventId(), date, title: title.trim() || "(제목 없음)", time: showTime ? time : "", memo: showMemo ? memo.trim() : "" });
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span aria-hidden="true" className="ml-1 h-1 w-8 rounded-full bg-slate-200" />
        <button type="button" onClick={onClose} aria-label="닫기" className={iconBtn}>
          ✕
        </button>
      </div>

      {mode === "create" && (
        <div role="tablist" aria-label="무엇을 만들까요" className="mb-3 flex gap-1.5">
          {(
            [
              ["event", "일정"],
              ["log", "활동일지"],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${tab === id ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      {tab === "log" && mode === "create" ? (
        <div className="space-y-3 px-1 pb-1">
          <p className="text-sm font-semibold text-slate-800">{label(initialDate)}</p>
          {log ? (
            <>
              <p className="text-sm text-slate-600">
                이 날짜가 들어 있는 활동일지가 있어요. <b className="text-emerald-700">{md(log.start)} ~ {md(log.end)}</b>
              </p>
              <button type="button" onClick={() => onOpenLog(log.key)} className="w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700">
                활동일지 열기
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">이 날짜의 활동일지는 아직 없어요. 새로 쓰면 달력에 초록 막대로 표시돼요.</p>
              <button type="button" onClick={() => onOpenLog(mondayOf(initialDate))} className="w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700">
                활동일지 쓰기
              </button>
            </>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            value={title}
            maxLength={EVENT_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 추가"
            aria-label="일정 제목"
            autoFocus
            className="w-full border-0 border-b-2 border-slate-200 bg-transparent px-1 pb-1.5 text-xl outline-none transition placeholder:text-slate-400 focus:border-indigo-500"
          />

          <div className="flex items-center gap-3 px-1">
            <span aria-hidden="true" className="w-5 text-center text-slate-400">
              🕐
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="날짜" className={`${inputClass} h-9 w-auto`} />
              {showTime ? (
                <>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="시간" className={`${inputClass} h-9 w-auto`} />
                  <button
                    type="button"
                    onClick={() => {
                      setShowTime(false);
                      setTime("");
                    }}
                    className="rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    종일로
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setShowTime(true)} className="rounded-full px-3 py-1.5 text-sm font-semibold text-indigo-600 ring-1 ring-inset ring-slate-300 transition hover:bg-indigo-50">
                  시간 추가
                </button>
              )}
            </div>
          </div>
          {!showTime && <p className="-mt-1.5 pl-9 text-xs text-slate-400">시간을 정하지 않으면 종일 일정이에요.</p>}

          <div className="flex items-start gap-3 px-1">
            <span aria-hidden="true" className="w-5 pt-2 text-center text-slate-400">
              ≡
            </span>
            {showMemo ? (
              <textarea value={memo} maxLength={EVENT_MEMO_MAX} onChange={(e) => setMemo(e.target.value)} placeholder="설명 추가" aria-label="설명" rows={3} autoFocus={mode === "edit"} className={`${inputClass} resize-none py-2`} />
            ) : (
              <button type="button" onClick={() => setShowMemo(true)} className="rounded-lg px-2 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100">
                설명 추가
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
              취소
            </button>
            <button type="submit" className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700">
              저장
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
