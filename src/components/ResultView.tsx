"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GenerationResult, StudentDoc } from "./TimetableApp";
import { AlertIcon, CheckIcon, DownloadIcon, InfoIcon, RefreshIcon, Spinner } from "./icons";

type Tab = "document" | "students";


/** Blob 을 다운로드 링크용 주소로 바꾸고, 쓰지 않게 되면 정리 */
function useObjectUrl(blob: Blob) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url;
}

export default function ResultView({ result, onRestart }: { result: GenerationResult; onRestart: () => void }) {
  const [tab, setTab] = useState<Tab>("document");
  const [selectedKey, setSelectedKey] = useState(result.studentDocs[0]?.key ?? "");
  const masterUrl = useObjectUrl(result.blob);
  const zipUrl = useObjectUrl(result.zipBlob);

  const messages = [
    ...result.warnings.map((text) => ({ text, level: "warn" as const })),
    ...result.notes.map((text) => ({ text, level: "info" as const })),
  ];

  const tabs: [Tab, string][] = [
    ["document", "전체 시간표"],
    ["students", `학생별 시간표 (${result.studentDocs.length})`],
  ];

  return (
    <div className="fade-up">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
            생성 완료
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">{result.title}</h1>
          <p className="mt-1 text-[15px] text-slate-500">
            전체 시간표 1장과 학생별 시간표 {result.studentDocs.length}장을 만들었어요.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshIcon className="h-4 w-4" />
            처음부터 다시
          </button>
          <a
            href={masterUrl}
            download={result.fileName}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            <DownloadIcon className="h-4 w-4" />
            전체 시간표만
          </a>
          <a
            href={zipUrl}
            download={result.zipFileName}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            <DownloadIcon className="h-4 w-4" />
            모두 다운로드 (ZIP)
          </a>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="특수학생" value={`${result.students.length}명`} />
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
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div role="tablist" aria-label="미리보기 방식" className="inline-flex rounded-xl bg-slate-200/70 p-1">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`tab-${key}`}
                aria-selected={tab === key}
                aria-controls={`panel-${key}`}
                onClick={() => setTab(key)}
                className={`whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                  tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {/* 전체 시간표 미리보기는 탭을 바꿔도 다시 그리지 않도록 숨기기만 합니다 */}
          <div role="tabpanel" id="panel-document" aria-labelledby="tab-document" hidden={tab !== "document"}>
            <DocxPreview blob={result.blob} />
          </div>
          {tab === "students" && (
            <div role="tabpanel" id="panel-students" aria-labelledby="tab-students">
              <StudentDocs docs={result.studentDocs} selectedKey={selectedKey} onSelect={setSelectedKey} />
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

// ---------------------------------------------------------------- 학생별 시간표
function StudentDocs({
  docs,
  selectedKey,
  onSelect,
}: {
  docs: StudentDoc[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const selected = docs.find((d) => d.key === selectedKey) ?? docs[0];
  if (!selected) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
        만들어진 학생별 시간표가 없어요.
      </p>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <ul
        aria-label="학생 목록"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        {docs.map((d) => {
          const active = d.key === selected.key;
          return (
            <li key={d.key} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(d.key)}
                aria-current={active ? "true" : undefined}
                className={`group relative flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                  active
                    ? "border-indigo-300 bg-white shadow-sm ring-4 ring-indigo-100"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">{d.student.name}</span>
                  <span className="block text-xs text-slate-500">
                    {d.student.grade}학년 {d.student.cls}반
                  </span>
                </span>
                {/* 과목별 시간은 마우스를 올리거나 키보드로 고르면 말풍선으로 보여 줌 */}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg lg:group-hover:block lg:group-focus-visible:block"
                >
                  {d.subjectHours.length ? (
                    d.subjectHours.map(([subject, n]) => (
                      <span key={subject} className="flex justify-between gap-4 leading-relaxed">
                        <span>{subject}</span>
                        <span className="tabular-nums">{n}시간</span>
                      </span>
                    ))
                  ) : (
                    <span>특수학급 수업 없음</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="min-w-0">
        <StudentDocHeader doc={selected} />
        <DocxPreview key={selected.key} blob={selected.blob} />
      </div>
    </div>
  );
}

function StudentDocHeader({ doc }: { doc: StudentDoc }) {
  const url = useObjectUrl(doc.blob);
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold text-slate-900">
          {doc.student.name}
          <span className="ml-2 text-sm font-normal text-slate-500">
            {doc.student.grade}학년 {doc.student.cls}반 · {doc.student.subjects.join(", ")}
          </span>
        </p>
        {doc.hours === 0 && (
          <p className="mt-0.5 text-xs text-amber-700">학급 시간표에 이 학생의 수강 과목이 없어 빈 시간표예요.</p>
        )}
      </div>
      <a
        href={url}
        download={doc.fileName}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <DownloadIcon className="h-4 w-4" />
        {doc.student.name} 시간표 다운로드
      </a>
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
          <div className="shimmer relative aspect-[210/297] overflow-hidden rounded bg-white p-[8%] shadow-sm">
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
