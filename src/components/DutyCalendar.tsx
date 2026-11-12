"use client";

import { useEffect, useMemo, useState } from "react";
import { hasEntries, isoOf, logRange, mondayOf } from "@/lib/dutyLogSvg";
import { byTime, EVENT_MEMO_MAX, EVENT_TITLE_MAX, type DutyEvent } from "@/lib/dutyEvents";
import type { DutyDocs, EventDocs } from "./dutyLogSync";
import { newEventId } from "./dutyLogSync";
import { STATUS_TEXT, type Status } from "./useDutySync";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** 한 칸에 보여 주는 일정 칩 수 (넘으면 "+N개") */
const MAX_CHIPS = 3;
/** 활동일지 막대 한 줄의 높이와 간격 (rem) */
const BAR_H = 1.25;
const BAR_STEP = 1.4;
/** 칸 맨 위 날짜 숫자 아래에서 막대가 시작하는 자리 (rem) */
const BAR_TOP = 1.9;

/** 2026-11-09 → 11/9 */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}`;
const label = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
};

/** 쓴 활동일지 하나: key 는 그 주 월요일 날짜, start ~ end 는 양식에 적은 날짜 */
type LogItem = { key: string; start: string; end: string; signed: boolean };

type Props = {
  weeks: DutyDocs;
  events: EventDocs;
  status: Status;
  onOpenWeek: (monday: string) => void;
  onSaveEvent: (event: DutyEvent) => void;
  onRemoveEvent: (id: string) => void;
};

/** 활동일지 첫 화면: 구글 캘린더처럼 달력에 일정과 작성한 활동일지를 보여 줌. 날짜를 누르면 일정을 더하거나 활동일지를 씀 */
export default function DutyCalendar({ weeks, events, status, onOpenWeek, onSaveEvent, onRemoveEvent }: Props) {
  const [today] = useState(() => isoOf(new Date()));
  const [month, setMonth] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { y, m };
  });
  /** 열려 있는 날짜 창 (edit: 고치는 중인 일정) */
  const [open, setOpen] = useState<{ date: string; edit?: string } | null>(null);

  const byDate = useMemo(() => {
    const map: Record<string, DutyEvent[]> = {};
    for (const doc of Object.values(events)) {
      if (doc.event) (map[doc.event.date] ??= []).push(doc.event);
    }
    for (const list of Object.values(map)) list.sort(byTime);
    return map;
  }, [events]);

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

  const move = (delta: number) =>
    setMonth(({ y, m }) => {
      const d = new Date(y, m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  const goToday = () => {
    const [y, m] = today.split("-").map(Number);
    setMonth({ y, m });
  };

  return (
    <div className="fade-up mx-auto max-w-6xl">
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">특수교육실무사 활동일지</h1>
        <p className="mt-2 text-[15px] text-slate-500">날짜를 눌러 일정을 더하거나 활동일지를 써요. 초록색 막대는 활동일지를 쓴 기간이에요.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside aria-label="연도별 활동일지" className="h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-4">
          <h2 className="mb-2 px-1 text-sm font-bold text-slate-800">등록된 활동일지</h2>
          {tree.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs leading-relaxed text-slate-400">아직 쓴 활동일지가 없어요. 날짜를 눌러 활동일지를 써 보세요.</p>
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
                            <li key={item.key}>
                              <button
                                type="button"
                                onClick={() => onOpenWeek(item.key)}
                                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-800"
                              >
                                <span>
                                  {md(item.start)} ~ {md(item.end)}
                                </span>
                                {item.signed && <span className="rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700">서명</span>}
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

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => move(-1)} aria-label="이전 달" className="grid h-9 w-9 place-items-center rounded-lg text-lg text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
                ‹
              </button>
              <button type="button" onClick={() => move(1)} aria-label="다음 달" className="grid h-9 w-9 place-items-center rounded-lg text-lg text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
                ›
              </button>
              <h2 className="ml-2 text-xl font-bold text-slate-900" aria-live="polite">
                {month.y}년 {month.m}월
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={goToday} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
                오늘
              </button>
              <button
                type="button"
                onClick={() => onOpenWeek(mondayOf(today))}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700"
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
                    const inMonth = date.startsWith(`${month.y}-${String(month.m).padStart(2, "0")}`);
                    const list = byDate[date] ?? [];
                    const shown = list.slice(0, MAX_CHIPS);
                    const more = list.length - shown.length;
                    const covered = !!logOn(date);
                    return (
                      <div key={date} className={`relative min-h-[5.5rem] border-b border-r border-slate-100 sm:min-h-[7rem] ${inMonth ? "bg-white" : "bg-slate-50/70"}`}>
                        <button
                          type="button"
                          onClick={() => setOpen({ date })}
                          aria-label={`${label(date)} 일정과 활동일지${covered ? " (활동일지 작성됨)" : ""}`}
                          className="absolute inset-0 transition hover:bg-indigo-50/50 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                        />
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
                              onClick={() => setOpen({ date, edit: ev.id })}
                              title={`${ev.time ? `${ev.time} ` : ""}${ev.title}`}
                              className="pointer-events-auto truncate rounded bg-indigo-100 px-1.5 py-0.5 text-left text-[11px] font-semibold text-indigo-800 transition hover:bg-indigo-200"
                            >
                              {ev.time && <span className="mr-1 font-normal">{ev.time}</span>}
                              {ev.title}
                            </button>
                          ))}
                          {more > 0 && (
                            <button type="button" onClick={() => setOpen({ date })} className="pointer-events-auto self-start rounded px-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">
                              +{more}개
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
                      title={`활동일지 ${md(item.start)} ~ ${md(item.end)} 열기`}
                      className={`absolute z-[1] truncate bg-emerald-100 px-2 text-left text-[11px] font-semibold leading-5 text-emerald-800 transition hover:bg-emerald-200 ${fromStart ? "rounded-l-md" : ""} ${toEnd ? "rounded-r-md" : ""}`}
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

          <p aria-live="polite" className={`mt-3 text-center text-xs font-medium ${STATUS_TEXT[status].tone}`}>
            {STATUS_TEXT[status].text}
          </p>
        </div>
      </div>

      {open && (
        <DayDialog
          key={`${open.date}-${open.edit ?? ""}`}
          date={open.date}
          editId={open.edit}
          list={byDate[open.date] ?? []}
          log={logOn(open.date)}
          onClose={() => setOpen(null)}
          onSave={onSaveEvent}
          onRemove={onRemoveEvent}
          onOpenWeek={onOpenWeek}
        />
      )}
    </div>
  );
}

const input =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 날짜를 눌렀을 때 열리는 창: 그날 일정 목록과 추가·수정, 활동일지 열기 */
function DayDialog({
  date,
  editId,
  list,
  log,
  onClose,
  onSave,
  onRemove,
  onOpenWeek,
}: {
  date: string;
  editId?: string;
  list: DutyEvent[];
  /** 이 날짜를 다루는 활동일지 (없으면 undefined) */
  log?: LogItem;
  onClose: () => void;
  onSave: (event: DutyEvent) => void;
  onRemove: (id: string) => void;
  onOpenWeek: (monday: string) => void;
}) {
  const editing = list.find((e) => e.id === editId);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [time, setTime] = useState(editing?.time ?? "");
  const [memo, setMemo] = useState(editing?.memo ?? "");
  /** 고치는 중인 일정 (목록의 '수정'을 누르면 바뀜) */
  const [editingId, setEditingId] = useState(editing?.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clear = () => {
    setEditingId(undefined);
    setTitle("");
    setTime("");
    setMemo("");
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ id: editingId ?? newEventId(), date, title: title.trim(), time, memo: memo.trim() });
    clear();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`${label(date)} 일정과 활동일지`} className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-3 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fade-up mx-auto mt-6 max-w-md rounded-2xl bg-white p-5 shadow-xl sm:mt-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900">{label(date)}</h3>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
            닫기
          </button>
        </div>

        <section className="mb-5 rounded-xl bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-200">
          <p className="text-sm font-semibold text-emerald-900">활동일지{log ? ` · ${md(log.start)} ~ ${md(log.end)}` : ""}</p>
          <p className="mt-0.5 text-xs text-emerald-800">{log ? "이 날짜가 들어 있는 활동일지를 작성했어요." : "이 날짜의 활동일지가 아직 없어요."}</p>
          <button
            type="button"
            onClick={() => onOpenWeek(log ? log.key : mondayOf(date))}
            className="mt-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            {log ? "활동일지 열기" : "활동일지 쓰기"}
          </button>
        </section>

        <section className="mb-5">
          <h4 className="mb-1.5 text-xs font-semibold text-slate-600">이 날의 일정 {list.length}개</h4>
          {list.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">아직 일정이 없어요.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {list.map((ev) => (
                <li key={ev.id} className={`flex items-start gap-2 px-3 py-2 text-sm ${ev.id === editingId ? "bg-indigo-50" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">
                      {ev.time && <span className="mr-1.5 font-normal text-slate-500">{ev.time}</span>}
                      {ev.title}
                    </p>
                    {ev.memo && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-500">{ev.memo}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(ev.id);
                      setTitle(ev.title);
                      setTime(ev.time);
                      setMemo(ev.memo);
                    }}
                    className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`'${ev.title}' 일정을 지울까요?`)) {
                        onRemove(ev.id);
                        if (ev.id === editingId) clear();
                      }
                    }}
                    className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form onSubmit={submit} className="space-y-2.5">
          <h4 className="text-xs font-semibold text-slate-600">{editingId ? "일정 고치기" : "일정 추가"}</h4>
          <input value={title} maxLength={EVENT_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="일정 제목 (예: 현장체험학습 지원)" aria-label="일정 제목" className={input} autoFocus={!editing} />
          <div className="flex items-center gap-2">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="시간 (비우면 종일)" className={`${input} w-36`} />
            <span className="text-xs text-slate-400">비우면 종일</span>
          </div>
          <textarea value={memo} maxLength={EVENT_MEMO_MAX} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" aria-label="메모" rows={2} className={`${input} h-auto resize-none py-2`} />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {editingId ? "수정 저장" : "일정 추가"}
            </button>
            {editingId && (
              <button type="button" onClick={clear} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
                취소
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
