"use client";

import { useEffect, useMemo, useState } from "react";
import {
  checkPath,
  DATE_LINE,
  DAYS,
  dayH,
  dayTop,
  dutyLogSvg,
  dutyLogText,
  emptyLog,
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

const SAVED_KEY = "zelkova:duty-log";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 이번 주 월요일 ~ 금요일 */
function thisWeek(): DutyLog {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);
  return emptyLog(iso(monday), iso(friday));
}

/** 지난번에 쓰던 내용 (브라우저에 저장돼 있으면). 모양이 맞지 않으면 새로 시작 */
function loadLog(): DutyLog {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null");
    if (
      v &&
      typeof v.start === "string" &&
      typeof v.end === "string" &&
      Array.isArray(v.checks) &&
      v.checks.length === DAYS.length * ROWS_PER_DAY &&
      Array.isArray(v.notes) &&
      v.notes.length === DAYS.length
    ) {
      return { start: v.start, end: v.end, checks: v.checks.map(Boolean), notes: v.notes.map(String), signed: !!v.signed };
    }
  } catch {
    // 저장된 내용이 없거나 막힌 브라우저
  }
  return thisWeek();
}

/** 양식의 좌표(595 × 842 단위)를 화면 비율(%)로 */
const pct = (x: number, y: number, w: number, h: number) => ({
  left: `${(x / LOG_W) * 100}%`,
  top: `${(y / LOG_H) * 100}%`,
  width: `${(w / LOG_W) * 100}%`,
  height: `${(h / LOG_H) * 100}%`,
});
/** 쪽 너비에 맞춰 커지는 글자 크기 (양식 단위 → 쪽 너비 %) */
const cq = (size: number) => `${(size / LOG_W) * 100}cqw`;

export default function DutyLogApp() {
  const [log, setLog] = useState<DutyLog>(loadLog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(log));
    } catch {
      // 저장 공간이 없거나 막힌 브라우저: 이번 화면에서만 유지
    }
  }, [log]);

  const blank = useMemo(() => dutyLogSvg(log), [log.start]); // eslint-disable-line react-hooks/exhaustive-deps -- 머리글의 학년도만 시작일에 따라 바뀜

  const toggle = (k: number) => setLog((l) => ({ ...l, checks: l.checks.map((c, i) => (i === k ? !c : c)) }));
  /** 요일 이름을 누르면 그날 항목을 모두 체크 (이미 모두 체크했으면 모두 해제) */
  const toggleDay = (d: number) =>
    setLog((l) => {
      const range = Array.from({ length: ROWS_PER_DAY }, (_, i) => d * ROWS_PER_DAY + i);
      const all = range.every((k) => l.checks[k]);
      return { ...l, checks: l.checks.map((c, k) => (range.includes(k) ? !all : c)) };
    });
  const setNote = (d: number, text: string) => setLog((l) => ({ ...l, notes: l.notes.map((n, i) => (i === d ? text : n)) }));
  const reset = () => {
    if (window.confirm("체크와 비고, 서명을 모두 지우고 이번 주로 새로 시작할까요?")) setLog(thisWeek());
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
      doc.save(`특수교육실무사 활동일지 (${log.start || "날짜 없음"}).pdf`);
    } catch (e) {
      console.error(e);
      setError("PDF로 저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const dateInput = (value: string, onChange: (v: string) => void, x: number, label: string) => (
    <input
      type="date"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="absolute rounded-sm border-0 border-b border-dotted border-slate-400 bg-transparent p-0 text-[#1f2a44] outline-none focus:border-indigo-500 focus:bg-indigo-50/60"
      style={{ ...pct(x, DATE_LINE.y - 13, DATE_LINE.w, 16), fontSize: cq(11), fontFamily: INK_FONT }}
    />
  );

  return (
    <div className="fade-up mx-auto max-w-3xl">
      {/* 화면 글꼴 (React 가 문서 head 로 옮겨 한 번만 불러옴) */}
      <link rel="stylesheet" href={LOG_FONTS_URL} precedence="default" />
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">특수교육실무사 활동일지</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          칸을 눌러 체크하고, 날짜 · 비고를 적고, 작성자를 눌러 서명을 넣어요. 요일 이름을 누르면 그날을 한꺼번에 체크해요.
        </p>
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
      {error && (
        <p role="alert" className="mb-3 text-center text-xs font-medium text-red-600">
          {error}
        </p>
      )}

      <div className="mx-auto w-full max-w-[640px] overflow-hidden rounded-md bg-white shadow-lg ring-1 ring-slate-200 [container-type:inline-size]">
        <div className="relative select-none" style={{ aspectRatio: `${LOG_W} / ${LOG_H}` }}>
          <div className="absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: blank }} />

          {dateInput(log.start, (v) => setLog((l) => ({ ...l, start: v })), DATE_LINE.startX, "시작 날짜")}
          {dateInput(log.end, (v) => setLog((l) => ({ ...l, end: v })), DATE_LINE.endX, "끝 날짜")}

          {/* 작성자: 누르면 서명이 들어가고, 다시 누르면 지워짐 */}
          <button
            type="button"
            onClick={() => setLog((l) => ({ ...l, signed: !l.signed }))}
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
                className="absolute resize-none overflow-hidden rounded-sm border-0 bg-transparent p-0 text-[#1f2a44] outline-none [overflow-wrap:anywhere] focus:bg-indigo-50/60"
                style={{ ...pct(noteBox(d).x, noteBox(d).y, noteBox(d).w, noteBox(d).h), fontFamily: INK_FONT, fontSize: cq(NOTE_FONT + 1), lineHeight: cq(NOTE_LINE) }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
