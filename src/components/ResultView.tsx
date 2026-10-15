"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DAYS, slotKey } from "@/lib/timetable";
import type { GenerationResult } from "./TimetableApp";
import { AlertIcon, CheckIcon, DownloadIcon, InfoIcon, RefreshIcon, Spinner } from "./icons";

type Tab = "document" | "summary";

const SUBJECT_STYLES: Record<string, string> = {
  국어: "bg-rose-50 text-rose-700 ring-rose-200",
  영어: "bg-sky-50 text-sky-700 ring-sky-200",
  수학: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};
const subjectStyle = (s: string) => SUBJECT_STYLES[s] ?? "bg-slate-50 text-slate-700 ring-slate-200";

export default function ResultView({ result, onRestart }: { result: GenerationResult; onRestart: () => void }) {
  const [tab, setTab] = useState<Tab>("document");
  const fileName = `${result.title.replace(/[\\/:*?"<>|]/g, "").trim() || "특수학급 시간표"}.docx`;
  const url = useMemo(() => URL.createObjectURL(result.blob), [result.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const filledSlots = result.schedule.size;
  const messages = [
    ...result.warnings.map((text) => ({ text, level: "warn" as const })),
    ...result.notes.map((text) => ({ text, level: "info" as const })),
  ];

  return (
    <div className="fade-up">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
            생성 완료
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">{result.title}</h1>
          <p className="mt-1 text-[15px] text-slate-500">미리보기를 확인한 뒤 워드 파일로 내려받으세요.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:flex-none"
          >
            <RefreshIcon className="h-4 w-4" />
            처음부터 다시
          </button>
          <a
            href={url}
            download={fileName}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:flex-none"
          >
            <DownloadIcon className="h-4 w-4" />
            워드 파일 다운로드
          </a>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="특수학생" value={`${result.students.length}명`} />
        <Stat label="학급 시간표" value={`${result.classCount}개`} />
        <Stat label="채워진 교시" value={`${filledSlots}칸`} />
      </dl>

      {messages.length > 0 && (
        <ul className="mt-4 space-y-2">
          {messages.map((m) => (
            <li
              key={m.text}
              className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
                m.level === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {m.level === "warn" ? (
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              )}
              {m.text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <div role="tablist" aria-label="미리보기 방식" className="inline-flex rounded-xl bg-slate-200/70 p-1">
          {(
            [
              ["document", "문서 미리보기"],
              ["summary", "요일별 요약"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`panel-${key}`}
              onClick={() => setTab(key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {/* 문서 미리보기는 탭을 바꿔도 다시 그리지 않도록 숨기기만 합니다 */}
          <div role="tabpanel" id="panel-document" aria-labelledby="tab-document" hidden={tab !== "document"}>
            <DocxPreview blob={result.blob} />
          </div>
          {tab === "summary" && (
            <div role="tabpanel" id="panel-summary" aria-labelledby="tab-summary">
              <SummaryTable result={result} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- 워드 미리보기
const A4_WIDTH_PX = 794;

function DocxPreview({ blob }: { blob: Blob }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    setState("loading");
    (async () => {
      const { renderAsync } = await import("docx-preview");
      host.innerHTML = "";
      await renderAsync(blob, host, undefined, {
        className: "docx",
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        renderHeaders: true,
        renderFooters: true,
      });
      if (!cancelled) setState("ready");
    })().catch((e) => {
      console.error(e);
      if (!cancelled) setState("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  // 화면 폭이 A4보다 좁으면 문서 전체가 보이도록 축소
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setZoom(Math.min(1, w / A4_WIDTH_PX));
    });
    ro.observe(frame);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={frameRef} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-8">
      {state === "loading" && (
        <div className="mx-auto max-w-[794px]" aria-live="polite">
          <div className="relative aspect-[210/297] overflow-hidden rounded bg-white p-[8%] shadow-sm shimmer">
            <div className="mx-auto h-4 w-1/2 rounded bg-slate-200" />
            <div className="mt-10 grid grid-cols-6 gap-1.5">
              {Array.from({ length: 42 }, (_, i) => (
                <div key={i} className={`h-14 rounded ${i % 6 === 0 ? "bg-slate-100" : "bg-slate-200/70"}`} />
              ))}
            </div>
            <p className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Spinner className="h-4 w-4 text-indigo-600" />
              미리보기를 그리는 중…
            </p>
          </div>
        </div>
      )}
      {state === "failed" && (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <AlertIcon className="h-4 w-4" />
          미리보기를 표시하지 못했어요. 파일을 내려받아 워드에서 확인해 주세요.
        </p>
      )}
      <div
        ref={hostRef}
        className="docx-host"
        style={{ zoom, display: state === "ready" ? undefined : "none" }}
        aria-label="생성된 시간표 문서 미리보기"
      />
    </div>
  );
}

// ---------------------------------------------------------------- 요일별 요약 표
function SummaryTable({ result }: { result: GenerationResult }) {
  const periods = useMemo(() => {
    const max = Math.max(0, ...[...result.schedule.keys()].map((k) => +k.split("-")[1]));
    return Array.from({ length: Math.max(max, 1) }, (_, i) => i + 1);
  }, [result.schedule]);

  const perStudent = useMemo(() => {
    const count = new Map<string, number>();
    for (const groups of result.schedule.values()) {
      for (const g of groups) for (const n of g.names) count.set(n, (count.get(n) ?? 0) + 1);
    }
    return result.students.map((s) => ({ ...s, count: count.get(s.name) ?? 0 }));
  }, [result]);

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th scope="col" className="w-16 border-b border-slate-200 px-3 py-2.5 text-xs font-semibold">
                <span className="sr-only">교시</span>
              </th>
              {DAYS.map((d) => (
                <th key={d} scope="col" className="border-b border-l border-slate-200 px-3 py-2.5 font-semibold">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p} className="align-top">
                <th scope="row" className="border-b border-slate-100 px-3 py-3 text-xs font-semibold text-slate-500">
                  {p}교시
                </th>
                {DAYS.map((_, d) => {
                  const groups = result.schedule.get(slotKey(d, p)) ?? [];
                  return (
                    <td key={d} className="border-b border-l border-slate-100 px-2.5 py-2.5">
                      {groups.length === 0 ? (
                        <span className="text-slate-300">–</span>
                      ) : (
                        <div className="space-y-1.5">
                          {groups.map((g) => (
                            <div key={g.subject}>
                              <span
                                className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${subjectStyle(g.subject)}`}
                              >
                                {g.subject}
                              </span>
                              <p className="mt-0.5 leading-snug text-slate-700">{g.names.join(", ")}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700">학생별 특수학급 수업</h3>
        <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {perStudent.map((s) => (
            <li
              key={`${s.grade}-${s.cls}-${s.name}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{s.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {s.grade}학년 {s.cls}반 · {s.subjects.join(", ")}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  s.count ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                주 {s.count}시간
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
