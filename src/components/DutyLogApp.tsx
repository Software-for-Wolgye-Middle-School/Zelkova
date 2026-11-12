"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { editStamp, fetchServer, loadLocal, pushServer, saveLocal, type DutyDoc } from "./dutyLogSync";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 이번 주 월요일 ~ 금요일 */
function thisWeek(): DutyLog {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);
  return emptyLog(iso(monday), iso(friday));
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

/** 서버 저장 상태 */
type Status = "checking" | "saving" | "saved" | "offline" | "login";

const STATUS_TEXT: Record<Status, { text: string; tone: string }> = {
  checking: { text: "서버와 맞춰 보는 중…", tone: "text-slate-400" },
  saving: { text: "저장 중…", tone: "text-slate-500" },
  saved: { text: "✓ 서버에 저장됐어요", tone: "text-emerald-600" },
  offline: { text: "서버에 연결되지 않아 이 컴퓨터에 먼저 저장했어요. 연결되면 자동으로 서버에 저장돼요.", tone: "text-amber-600" },
  login: { text: "로그인이 풀려 이 컴퓨터에 먼저 저장했어요. 다시 로그인하면 자동으로 서버에 저장돼요.", tone: "text-amber-600" },
};

const RETRY_MS = [3000, 8000, 20000, 60000];

export default function DutyLogApp() {
  // 이 컴퓨터에 저장된 내용이 있으면 이어서 쓰고, 서버에 더 나중에 고친 내용이 있으면 아래에서 그쪽으로 바꿈
  const [initial] = useState<DutyDoc>(() => loadLocal() ?? { log: thisWeek(), updatedAt: 0, synced: true });
  const docRef = useRef<DutyDoc>(initial);
  const [log, setLog] = useState<DutyLog>(initial.log);
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 서버에 저장을 예약 (debounce 없이 바로 하려면 0) */
  const scheduleRef = useRef<(ms: number) => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sending = false;
    let again = false;
    let failures = 0;

    const adopt = (doc: { log: DutyLog; updatedAt: number }) => {
      docRef.current = { ...doc, synced: true };
      saveLocal(docRef.current);
      setLog(doc.log);
      setStatus("saved");
    };
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), ms);
    };
    async function flush() {
      if (cancelled) return;
      if (sending) {
        again = true;
        return;
      }
      const snap = docRef.current;
      if (snap.synced) return;
      sending = true;
      const result = await pushServer({ log: snap.log, updatedAt: snap.updatedAt });
      sending = false;
      if (cancelled) return;
      if (result.kind === "ok") {
        failures = 0;
        // 보내는 사이에 또 고쳤다면 그 내용은 다음 저장에서 올라감
        if (docRef.current.updatedAt === snap.updatedAt) {
          docRef.current = { ...snap, synced: true };
          saveLocal(docRef.current);
          setStatus("saved");
        }
      } else if (result.kind === "stale") {
        // 다른 곳에서 더 나중에 고친 내용이 서버에 있음
        failures = 0;
        if (result.doc.updatedAt >= docRef.current.updatedAt) adopt(result.doc);
      } else {
        setStatus(result.kind === "auth" ? "login" : "offline");
        schedule(RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)]); // 서버가 돌아올 때까지 계속 다시 시도
        return;
      }
      if (again) {
        again = false;
        schedule(0);
      }
    }
    scheduleRef.current = schedule;

    (async () => {
      const server = await fetchServer();
      if (cancelled) return;
      if (server.kind !== "ok") {
        if (docRef.current.synced) setStatus(server.kind === "auth" ? "login" : "offline");
        else {
          setStatus(server.kind === "auth" ? "login" : "offline");
          schedule(RETRY_MS[0]);
        }
        return;
      }
      const local = docRef.current;
      if (server.doc && server.doc.updatedAt > local.updatedAt) adopt(server.doc);
      else if (!local.synced || (!server.doc && local.updatedAt > 0)) {
        docRef.current = { ...local, synced: false };
        schedule(0);
      } else setStatus("saved");
    })();

    // 연결이 돌아오거나 탭으로 돌아왔을 때 바로 다시 시도, 탭을 닫는 중에도 올리지 못한 내용은 마지막으로 보냄
    const retryNow = () => {
      if (!docRef.current.synced) schedule(0);
    };
    const onHide = () => {
      const d = docRef.current;
      if (!d.synced) void pushServer({ log: d.log, updatedAt: d.updatedAt }, true);
    };
    const onVisible = () => document.visibilityState === "visible" && retryNow();
    window.addEventListener("online", retryNow);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", retryNow);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisible);
      onHide(); // 다른 화면으로 나갈 때도 올리지 못한 내용은 보냄
    };
  }, []);

  /** 고친 내용을 먼저 이 컴퓨터에 저장하고, 곧이어 서버에 저장 */
  const update = (change: (l: DutyLog) => DutyLog) => {
    const next = change(docRef.current.log);
    docRef.current = { log: next, updatedAt: editStamp(), synced: false };
    saveLocal(docRef.current);
    setLog(next);
    setStatus("saving");
    scheduleRef.current(500);
  };

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
    if (window.confirm("체크와 비고, 서명을 모두 지우고 이번 주로 새로 시작할까요?")) update(thisWeek);
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
