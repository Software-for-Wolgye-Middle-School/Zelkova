"use client";

import { useMemo, useState } from "react";
import {
  checkPath,
  DATE_LINE,
  DAYS,
  dayH,
  dayTop,
  dutyLogSvg,
  dutyLogText,
  addDays,
  hasEntries,
  isoOf,
  mondayOf,
  weekLog,
  GRID,
  INK_FONT,
  ITEMS,
  LOG_FONTS_URL,
  LOG_H,
  LOG_W,
  NOTE_FONT,
  NOTE_LINE,
  NOTE_MAX,
  noteBox,
  PRINT_FAMILY,
  INK_FAMILY,
  ROWS_PER_DAY,
  rowTop,
  SIGN_BOX,
  WRITER,
  type DutyLog,
} from "@/lib/dutyLogSvg";
import { embeddedFontCss, svgToPng, withFont } from "@/lib/svgExport";
import { DownloadIcon, Spinner } from "./icons";
import DutyCalendar from "./DutyCalendar";
import { STATUS_TEXT, useDutySync, type Status } from "./useDutySync";
import type { DutyDocs } from "./dutyLogSync";

/** 쓴 내용이 있는 주들 (최근 주가 앞) */
const weeksWithEntries = (docs: DutyDocs) =>
  Object.keys(docs)
    .filter((k) => hasEntries(docs[k].log))
    .sort()
    .reverse();

/** 2026-11-09 → 2026.11.09 */
const dotted = (iso: string) => iso.replace(/-/g, ".");

/** 양식의 좌표(595 × 842 단위)를 화면 비율(%)로 */
const pct = (x: number, y: number, w: number, h: number) => ({
  left: `${(x / LOG_W) * 100}%`,
  top: `${(y / LOG_H) * 100}%`,
  width: `${(w / LOG_W) * 100}%`,
  height: `${(h / LOG_H) * 100}%`,
});
/** 쪽 너비에 맞춰 커지는 글자 크기 (양식 단위 → 쪽 너비 %) */
const cq = (size: number) => `${(size / LOG_W) * 100}cqw`;

/** 양식 위 날짜 줄의 날짜 입력칸 (글씨는 칸 가운데) */
function DateField({ value, onChange, x, label }: { value: string; onChange: (v: string) => void; x: number; label: string }) {
  return (
    <input
      type="date"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="absolute rounded-sm border-0 border-b border-dotted border-slate-400 bg-transparent p-0 text-center text-[#1f2a44] outline-none focus:border-indigo-500 focus:bg-indigo-50/60"
      style={{ ...pct(x, DATE_LINE.y - 13, DATE_LINE.w, 16), fontSize: cq(11), fontFamily: INK_FONT }}
    />
  );
}

type EditorProps = {
  /** 지금 보고 있는 주 (월요일 날짜) */
  weekKey: string;
  log: DutyLog;
  /** 기록한 주들 (최근 주가 앞) */
  savedWeeks: string[];
  status: Status;
  onChange: (change: (l: DutyLog) => DutyLog) => void;
  onWeek: (key: string) => void;
  onBack: () => void;
};

/** 한 주의 활동일지를 쓰는 화면 */
function DutyLogEditor({ weekKey, log, savedWeeks, status, onChange: update, onWeek: goWeek, onBack }: EditorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blank = useMemo(() => dutyLogSvg(log), [log.start]); // eslint-disable-line react-hooks/exhaustive-deps -- 머리글의 학년도만 시작일에 따라 바뀜

  const toggle = (k: number) => update((l) => ({ ...l, checks: l.checks.map((c, i) => (i === k ? !c : c)) }));
  /** 요일 이름을 누르면 그날 항목을 모두 체크 (이미 모두 체크했으면 모두 해제) */
  const toggleDay = (d: number) =>
    update((l) => {
      const range = Array.from({ length: ROWS_PER_DAY }, (_, i) => d * ROWS_PER_DAY + i);
      const all = range.every((k) => l.checks[k]);
      return { ...l, checks: l.checks.map((c, k) => (range.includes(k) ? !all : c)) };
    });
  const setNote = (d: number, text: string) => update((l) => ({ ...l, notes: l.notes.map((n, i) => (i === d ? text : n)) }));
  const reset = () => {
    if (window.confirm(`이 주(${dotted(weekKey)} ~ ${dotted(addDays(weekKey, 4))})의 체크와 비고, 서명을 모두 지우고 새로 시작할까요?`)) update(() => weekLog(weekKey));
  };

  const savePdf = async () => {
    setBusy(true);
    setError(null);
    try {
      const text = dutyLogText(log);
      const [{ jsPDF }, printCss, inkCss] = await Promise.all([import("jspdf"), embeddedFontCss(text.print, PRINT_FAMILY), embeddedFontCss(text.ink, INK_FAMILY)]);
      const blob = await svgToPng(withFont(dutyLogSvg(log, true), printCss + inkCss), LOG_W, LOG_H, 3.5, "image/jpeg");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.addImage(new Uint8Array(await blob.arrayBuffer()), "JPEG", 0, 0, 210, 297);
      doc.save(`특수교육실무사 활동일지 (${log.start || weekKey}).pdf`);
    } catch (e) {
      console.error(e);
      setError("PDF로 저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-up mx-auto max-w-3xl">
      {/* 화면 글꼴 (React 가 문서 head 로 옮겨 한 번만 불러옴) */}
      <link rel="stylesheet" href={LOG_FONTS_URL} precedence="default" />
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
        ‹ 달력으로
      </button>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">특수교육실무사 활동일지</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          주마다 한 장씩 기록돼요. 칸을 눌러 체크하고, 날짜 · 비고를 적고, 작성자를 눌러 서명을 넣어요. 요일 이름을 누르면 그날을 한꺼번에 체크해요.
        </p>
      </div>

      {/* 주 고르기: 날짜별(주별) 기록 */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={() => goWeek(addDays(weekKey, -7))} aria-label="지난주" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
            ‹ 지난주
          </button>
          <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
            <span className="text-xs text-slate-500">날짜로 찾기</span>
            <input
              type="date"
              value={weekKey}
              onChange={(e) => e.target.value && goWeek(mondayOf(e.target.value))}
              aria-label="이 날짜가 있는 주로 이동"
              className="rounded border-0 bg-transparent p-0 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <button type="button" onClick={() => goWeek(addDays(weekKey, 7))} aria-label="다음주" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
            다음주 ›
          </button>
          <button type="button" onClick={() => goWeek(mondayOf(isoOf(new Date())))} className="rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-50">
            이번 주
          </button>
        </div>
        <p className="text-center text-sm font-semibold text-slate-700">
          {dotted(weekKey)} ~ {dotted(addDays(weekKey, 4))}
        </p>
        {savedWeeks.length > 0 && (
          <div className="mx-auto flex max-h-24 max-w-xl flex-wrap justify-center gap-1.5 overflow-y-auto" role="group" aria-label="기록한 주">
            {savedWeeks.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => goWeek(k)}
                aria-pressed={k === weekKey}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${k === weekKey ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
              >
                {dotted(k).slice(2)} 주
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={savePdf}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {busy ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
          PDF 다운로드
        </button>
        <button type="button" onClick={reset} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
          새로 시작
        </button>
      </div>
      <p aria-live="polite" className={`mb-3 text-center text-xs font-medium ${STATUS_TEXT[status].tone}`}>
        {STATUS_TEXT[status].text}
      </p>
      {error && (
        <p role="alert" className="mb-3 text-center text-xs font-medium text-red-600">
          {error}
        </p>
      )}

      <div className="mx-auto w-full max-w-[640px] overflow-hidden rounded-md bg-white shadow-lg ring-1 ring-slate-200 [container-type:inline-size]">
        <div className="relative select-none" style={{ aspectRatio: `${LOG_W} / ${LOG_H}` }}>
          <div className="absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: blank }} />

          <DateField value={log.start} onChange={(v) => update((l) => ({ ...l, start: v }))} x={DATE_LINE.startX} label="시작 날짜" />
          <DateField value={log.end} onChange={(v) => update((l) => ({ ...l, end: v }))} x={DATE_LINE.endX} label="끝 날짜" />

          {/* 작성자: 누르면 서명이 들어가고, 다시 누르면 지워짐 */}
          <button
            type="button"
            onClick={() => update((l) => ({ ...l, signed: !l.signed }))}
            aria-pressed={log.signed}
            aria-label={log.signed ? "서명 지우기" : `${WRITER} 서명 넣기`}
            title={log.signed ? "누르면 서명을 지워요" : "누르면 서명이 들어가요"}
            className="absolute rounded-sm text-left transition hover:bg-indigo-50/70"
            style={{ ...pct(SIGN_BOX.x + 44, SIGN_BOX.y, SIGN_BOX.w - 62, SIGN_BOX.h), color: "#1f2a44", fontFamily: INK_FONT, fontSize: cq(17) }}
          >
            {log.signed ? WRITER : <span className="text-slate-300" style={{ fontSize: cq(9), fontFamily: "inherit" }}>눌러서 서명</span>}
          </button>

          {DAYS.map((day, d) => (
            <div key={day}>
              <button
                type="button"
                onClick={() => toggleDay(d)}
                aria-label={`${day}요일 전체 체크`}
                title="누르면 이 요일을 모두 체크해요"
                className="absolute rounded-sm transition hover:bg-indigo-50/70"
                style={pct(GRID.x[1] + 1, dayTop(d) + dayH / 2 - 12, GRID.x[2] - GRID.x[1] - 2, 24)}
              />
              {ITEMS.map((item, i) => {
                const k = d * ROWS_PER_DAY + i;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggle(k)}
                    aria-pressed={log.checks[k]}
                    aria-label={`${day}요일 ${item}`}
                    className="absolute transition hover:bg-indigo-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                    style={pct(GRID.x[3] + 0.6, rowTop(d, i) + 0.3, GRID.x[4] - GRID.x[3] - 1.2, GRID.rowH - 0.6)}
                  >
                    {log.checks[k] && (
                      <svg viewBox={`${GRID.x[3]} ${-GRID.rowH / 2} ${GRID.x[4] - GRID.x[3]} ${GRID.rowH}`} className="h-full w-full" aria-hidden="true">
                        <path d={checkPath(k)} fill="none" stroke="#1f2a44" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })}
              <textarea
                value={log.notes[d]}
                maxLength={NOTE_MAX}
                onChange={(e) => setNote(d, e.target.value)}
                aria-label={`${day}요일 비고`}
                className="absolute resize-none overflow-hidden rounded-sm border-0 bg-transparent p-0 text-center text-[#1f2a44] outline-none [overflow-wrap:anywhere] focus:bg-indigo-50/60"
                style={{ ...pct(noteBox(d).x, noteBox(d).y, noteBox(d).w, noteBox(d).h), fontFamily: INK_FONT, fontSize: cq(NOTE_FONT + 1), lineHeight: cq(NOTE_LINE) }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 처음에는 달력(일정 + 등록한 활동일지)을 보여 주고, 날짜나 활동일지를 눌러 일정을 더하거나 활동일지를 씀 */
export default function DutyLogApp() {
  const { weeks, events, status, editWeek, saveEvent, removeEvent } = useDutySync();
  const [view, setView] = useState<{ mode: "calendar" } | { mode: "edit"; week: string }>({ mode: "calendar" });
  const savedWeeks = useMemo(() => weeksWithEntries(weeks as DutyDocs), [weeks]);

  if (view.mode === "edit") {
    const key = view.week;
    return (
      <DutyLogEditor
        weekKey={key}
        log={weeks[key]?.log ?? weekLog(key)}
        savedWeeks={savedWeeks}
        status={status}
        onChange={(change) => editWeek(key, change)}
        onWeek={(week) => setView({ mode: "edit", week })}
        onBack={() => setView({ mode: "calendar" })}
      />
    );
  }
  return (
    <DutyCalendar
      weeks={weeks}
      events={events}
      status={status}
      onOpenWeek={(week) => setView({ mode: "edit", week })}
      onSaveEvent={saveEvent}
      onRemoveEvent={removeEvent}
    />
  );
}
