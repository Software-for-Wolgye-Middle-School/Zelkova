"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  checkPath,
  DATE_LINE,
  DAYS,
  dayH,
  dayTop,
  dutyLogSvg,
  dutyLogText,
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
import { StepHeading, StepNav, StepProgress, useStepFlow, type Step } from "./StepFlow";

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

/** 입력하기 → 다운로드하기 (입력한 내용은 자동으로 서버에 저장됨) */
const STEPS: readonly Step[] = [
  {
    title: "입력하기",
    heading: "활동일지를 입력해 주세요",
  },
  { title: "다운로드", heading: "PDF로 내려받아요", hint: "입력한 활동일지를 인쇄할 수 있는 PDF로 받아요." },
];

type EditorProps = {
  /** 지금 쓰는 주 (월요일 날짜) */
  weekKey: string;
  log: DutyLog;
  status: Status;
  onChange: (change: (l: DutyLog) => DutyLog) => void;
  /** 지금 서버에 저장 (다운로드 단계로 넘어갈 때 기다리지 않고 바로 올림) */
  onSaveNow: () => Promise<boolean>;
  onBack: () => void;
};

/** 전체 화면에서 고를 수 있는 배율 (1 = 화면 높이에 맞춤) */
const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
const zoomBtn =
  "grid h-9 w-9 place-items-center rounded-full text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";

/** 돋보기 아이콘 (plus: 확대 +, 아니면 축소 -) */
function ZoomIcon({ plus }: { plus: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.6-4.6M7.5 10.5h6" />
      {plus && <path d="M10.5 7.5v6" />}
    </svg>
  );
}

/** 한 주의 활동일지를 쓰는 화면 */
function DutyLogEditor({ weekKey, log, status, onChange: update, onSaveNow, onBack }: EditorProps) {
  const { step, checking, goStep, goNext, fadeClass } = useStepFlow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 양식을 화면 가득 크게 보며 고치기 */
  const [full, setFull] = useState(false);
  /** 전체 화면에서 양식을 키운 배율 (ZOOMS 의 칸 번호) */
  const [zoomAt, setZoomAt] = useState(0);
  const zoom = ZOOMS[zoomAt];
  const zoomBy = (d: 1 | -1) => setZoomAt((z) => Math.min(ZOOMS.length - 1, Math.max(0, z + d)));
  const closeFull = () => {
    setFull(false);
    setZoomAt(0);
  };

  // 전체 화면: Esc 로 닫기, 글을 쓰는 중이 아니면 + · - 로 확대 · 축소, 0 으로 원래 크기
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeFull();
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT");
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") zoomBy(1);
      else if (e.key === "-") zoomBy(-1);
      else if (e.key === "0") setZoomAt(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const blank = useMemo(() => dutyLogSvg(log), [log.start]); // eslint-disable-line react-hooks/exhaustive-deps -- 머리글의 학년도만 시작일에 따라 바뀜
  /** 입력하기 다음 단계에서는 입력한 내용이 들어간 모습을 그대로 보여 줌 */
  const filled = useMemo(() => dutyLogSvg(log, true), [log]);

  const toggle = (k: number) => update((l) => ({ ...l, checks: l.checks.map((c, i) => (i === k ? !c : c)) }));
  /** 요일 이름을 누르면 그날 항목을 모두 체크 (이미 모두 체크했으면 모두 해제) */
  const toggleDay = (d: number) =>
    update((l) => {
      const range = Array.from({ length: ROWS_PER_DAY }, (_, i) => d * ROWS_PER_DAY + i);
      const all = range.every((k) => l.checks[k]);
      return { ...l, checks: l.checks.map((c, k) => (range.includes(k) ? !all : c)) };
    });
  const setNote = (d: number, text: string) => update((l) => ({ ...l, notes: l.notes.map((n, i) => (i === d ? text : n)) }));

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

  /** 양식 (입력하기에서는 칸을 눌러 바로 고침). 전체 화면에서도 같은 양식을 씀 */
  const sheet = (
        <div className="relative select-none" style={{ aspectRatio: `${LOG_W} / ${LOG_H}` }}>
          <div className="absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: step === 0 ? blank : filled }} />

          {step === 0 && (
            <>
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
            </>
          )}
        </div>
  );
  const fullBtn = (
    <button
      type="button"
      onClick={() => setFull(true)}
      title="전체 화면으로 보기"
      aria-label="활동일지 전체 화면으로 보기"
      className="absolute left-1.5 top-1.5 z-10 grid h-8 w-8 place-items-center rounded-lg bg-white/90 text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-900"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </svg>
    </button>
  );

  return (
    <div className="fade-up mx-auto max-w-4xl">
      {/* 화면 글꼴 (React 가 문서 head 로 옮겨 한 번만 불러옴) */}
      <link rel="stylesheet" href={LOG_FONTS_URL} precedence="default" />
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
        ‹ 달력으로
      </button>
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">특수교육실무사 활동일지</h1>
      </div>

      <div className="mx-auto mb-5 max-w-[720px] space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <StepProgress steps={STEPS} step={step} checking={checking} onGo={(n) => goStep(n)} />

        <div className={`space-y-4 ${fadeClass}`}>
          <StepHeading step={STEPS[step]} />


          {step === 1 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={savePdf}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  {busy ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
                  PDF 다운로드
                </button>
                <button type="button" onClick={onBack} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
                  달력으로 돌아가기
                </button>
              </div>
              <p aria-live="polite" className={`text-xs font-medium ${STATUS_TEXT[status].tone}`}>
                {STATUS_TEXT[status].text}
              </p>
              {error && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

      {full ? (
        <p className="rounded-md bg-slate-50 px-3 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">전체 화면에서 보고 있어요.</p>
      ) : (
        <div className="relative mx-auto w-full overflow-hidden rounded-md bg-white ring-1 ring-slate-200 [container-type:inline-size]">
          {sheet}
          {fullBtn}
        </div>
      )}
      {full &&
        createPortal(
          <div role="dialog" aria-label="활동일지 전체 화면" className="fixed inset-0 z-[70] overflow-auto bg-slate-900/80">
            {/* 키우면 화면보다 커지므로 위아래 · 좌우로 스크롤해서 고침 */}
            <div className="flex min-h-full w-max min-w-full p-4 pt-16">
              <div
                className="relative m-auto shrink-0 overflow-hidden rounded-md bg-white shadow-2xl [container-type:inline-size]"
                style={{ width: `calc(min(100vw - 2rem, (100vh - 5rem) * ${LOG_W} / ${LOG_H}) * ${zoom})` }}
              >
                {sheet}
              </div>
            </div>

            {/* 돋보기: 축소 · 배율(누르면 원래 크기) · 확대 */}
            <div className="fixed left-1/2 top-3 z-[71] flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/95 p-1 shadow-lg ring-1 ring-slate-200">
              <button type="button" onClick={() => zoomBy(-1)} disabled={zoomAt === 0} title="축소 (-)" aria-label="축소" className={zoomBtn}>
                <ZoomIcon plus={false} />
              </button>
              <button type="button" onClick={() => setZoomAt(0)} title="원래 크기 (0)" aria-label="원래 크기로" className="min-w-[3.5rem] rounded-full px-2 py-1.5 text-sm font-semibold tabular-nums text-slate-700 transition hover:bg-slate-100">
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" onClick={() => zoomBy(1)} disabled={zoomAt === ZOOMS.length - 1} title="확대 (+)" aria-label="확대" className={zoomBtn}>
                <ZoomIcon plus />
              </button>
            </div>
            <button
              type="button"
              onClick={closeFull}
              title="전체 화면 닫기"
              aria-label="전체 화면 닫기"
              className="fixed right-4 top-3 z-[71] grid h-10 w-10 place-items-center rounded-full bg-white/95 text-lg text-slate-700 shadow-lg transition hover:bg-white"
            >
              ✕
            </button>
          </div>,
          document.body,
        )}

        <StepNav
          step={step}
          last={step === STEPS.length - 1}
          canNext
          checking={checking}
          onPrev={() => goStep(step - 1)}
          onNext={() => {
            void onSaveNow();
            goNext();
          }}
        />
      </div>
    </div>
  );
}

/** 처음에는 달력(일정 + 등록한 활동일지)을 보여 주고, 날짜나 활동일지를 눌러 일정을 더하거나 활동일지를 씀 */
export default function DutyLogApp() {
  const { weeks, events, status, editWeek, saveEvent, removeEvent, saveNow } = useDutySync();
  const [view, setView] = useState<{ mode: "calendar" } | { mode: "edit"; week: string }>({ mode: "calendar" });

  if (view.mode === "edit") {
    const key = view.week;
    return (
      <DutyLogEditor
        weekKey={key}
        log={weeks[key]?.log ?? weekLog(key)}
        status={status}
        onChange={(change) => editWeek(key, change)}
        onSaveNow={saveNow}
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
      onRemoveWeek={(week) => editWeek(week, () => weekLog(week))}
      onSaveEvent={saveEvent}
      onRemoveEvent={removeEvent}
    />
  );
}
