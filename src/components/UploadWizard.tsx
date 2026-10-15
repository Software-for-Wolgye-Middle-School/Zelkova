"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  FileBadge,
  PencilIcon,
  SparkleIcon,
  Spinner,
  UploadIcon,
  XIcon,
} from "./icons";
import StudentForm from "./StudentForm";
import type { RowErrors, StudentRow } from "./students";
import { CLASS_FILE, formatBytes, WIZARD_STEPS, type SlotState } from "./steps";

type Props = {
  step: number;
  onStepChange: (step: number) => void;
  rows: StudentRow[];
  onRowsChange: (rows: StudentRow[]) => void;
  studentErrors: Map<string, RowErrors>;
  studentCount: number;
  classSlot: SlotState;
  onFile: (file: File) => void;
  onClear: () => void;
  onGenerate: () => void;
  error: string | null;
  onDismissError: () => void;
};

type StepStatus = "todo" | "done" | "error" | "checking";

export default function UploadWizard({
  step,
  onStepChange,
  rows,
  onRowsChange,
  studentErrors,
  studentCount,
  classSlot,
  onFile,
  onClear,
  onGenerate,
  error,
  onDismissError,
}: Props) {
  const [showErrors, setShowErrors] = useState(false);
  const studentsDone = studentCount > 0 && studentErrors.size === 0;
  const classDone = classSlot.status === "ready";
  const def = WIZARD_STEPS[step];
  const isLast = step === WIZARD_STEPS.length - 1;

  const statuses: { status: StepStatus; sub: string }[] = [
    {
      status: studentsDone ? "done" : showErrors ? "error" : "todo",
      sub: studentCount ? `${studentCount}명 입력` : "입력 전",
    },
    {
      status: classDone
        ? "done"
        : classSlot.status === "error"
          ? "error"
          : classSlot.status === "checking"
            ? "checking"
            : "todo",
      sub: classSlot.status === "empty" ? "대기 중" : classSlot.status === "checking" ? "확인 중…" : classSlot.file.name,
    },
  ];

  const goNext = () => {
    if (!studentsDone) {
      setShowErrors(true);
      return;
    }
    onStepChange(1);
  };

  const selectStep = (i: number) => {
    if (i === 1 && !studentsDone) {
      setShowErrors(true);
      onStepChange(0);
      return;
    }
    onStepChange(i);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">두 단계면 시간표가 완성돼요</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          특수학생을 입력하고 학급 시간표를 올리면, 기본 특수학급 시간표 양식에 자동으로 채워 드려요.
        </p>
      </div>

      <Stepper statuses={statuses} current={step} onSelect={selectStep} />

      <section
        key={step}
        aria-labelledby="step-title"
        className="fade-up mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
      >
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div className="flex-1">
              <p className="font-semibold">시간표를 만들지 못했어요</p>
              <p className="mt-0.5 text-red-700">{error}</p>
            </div>
            <button
              type="button"
              onClick={onDismissError}
              className="rounded-md p-1 text-red-400 hover:bg-red-100 hover:text-red-600"
              aria-label="오류 메시지 닫기"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        <p className="text-sm font-semibold text-indigo-600">
          {step + 1}단계 <span className="font-normal text-slate-400">/ {WIZARD_STEPS.length}</span>
        </p>
        <h2 id="step-title" className="mt-1 text-xl font-bold tracking-tight text-slate-900">
          {def.heading}
        </h2>
        <p className="mt-1 text-[15px] text-slate-500">{def.description}</p>

        <div className="mt-6">
          {step === 0 ? (
            <StudentForm
              rows={rows}
              onChange={onRowsChange}
              errors={studentErrors}
              showErrors={showErrors}
              studentCount={studentCount}
            />
          ) : (
            <>
              <DropArea slot={classSlot} onFile={onFile} onClear={onClear} />
              <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3.5">
                <p className="text-xs font-semibold text-slate-500">이런 파일이에요</p>
                <ul className="mt-1.5 space-y-1 text-sm text-slate-600">
                  {CLASS_FILE.hints.map((h) => (
                    <li key={h} className="flex gap-2">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
              {classSlot.status === "ready" && (
                <ReviewList studentCount={studentCount} classSlot={classSlot} onEdit={onStepChange} />
              )}
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-6">
          <button
            type="button"
            onClick={() => onStepChange(step - 1)}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:invisible"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            이전
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={onGenerate}
              disabled={!(studentsDone && classDone)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <SparkleIcon className="h-5 w-5" />
              시간표 생성하기
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              다음
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        {step === 0 && showErrors && !studentsDone && (
          <p role="alert" className="mt-3 text-right text-sm font-medium text-red-600">
            {studentErrors.size === 0 ? "학생을 한 명 이상 입력해 주세요" : "빨간색으로 표시된 칸을 확인해 주세요"}
          </p>
        )}
        {isLast && !classDone && (
          <p className="mt-3 text-right text-xs text-slate-400">학급 시간표를 올리면 시간표를 만들 수 있어요</p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- 단계 표시
function Stepper({
  statuses,
  current,
  onSelect,
}: {
  statuses: { status: StepStatus; sub: string }[];
  current: number;
  onSelect: (i: number) => void;
}) {
  return (
    <nav aria-label="입력 단계">
      <ol className="flex items-stretch gap-2">
        {WIZARD_STEPS.map((s, i) => {
          const { status, sub } = statuses[i];
          const active = i === current;
          return (
            <li key={s.title} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={active ? "step" : undefined}
                className={`flex h-full w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                  active ? "border-indigo-300 bg-white shadow-sm ring-4 ring-indigo-100" : "border-transparent hover:bg-white/70"
                }`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
                    status === "done"
                      ? "bg-emerald-500 text-white"
                      : status === "error"
                        ? "bg-red-500 text-white"
                        : active
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {status === "done" ? (
                    <CheckIcon className="h-4 w-4" strokeWidth={3} />
                  ) : status === "error" ? (
                    "!"
                  ) : status === "checking" ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-semibold ${active ? "text-slate-900" : "text-slate-600"}`}>
                    {s.title}
                  </span>
                  <span className="block truncate text-xs text-slate-400">{sub}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------- 파일 올리기 영역
function DropArea({ slot, onFile, onClear }: { slot: SlotState; onFile: (f: File) => void; onClear: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const pick = () => inputRef.current?.click();

  const dragProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={CLASS_FILE.accept}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = "";
      }}
    />
  );

  if (slot.status === "empty") {
    return (
      <div {...dragProps}>
        {input}
        <button
          type="button"
          onClick={pick}
          className={`group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
            dragging
              ? "scale-[1.01] border-indigo-500 bg-indigo-50"
              : "border-slate-300 bg-slate-50/50 hover:border-indigo-400 hover:bg-indigo-50/40"
          }`}
        >
          <span
            className={`grid h-14 w-14 place-items-center rounded-2xl transition ${
              dragging ? "bg-indigo-600 text-white" : "bg-white text-indigo-600 shadow-sm group-hover:-translate-y-0.5"
            }`}
          >
            <UploadIcon className="h-6 w-6" />
          </span>
          <span className="mt-4 text-[15px] font-semibold text-slate-800">
            {dragging ? "여기에 놓으세요" : "파일을 끌어다 놓거나 클릭해서 선택하세요"}
          </span>
          <span className="mt-1 text-sm text-slate-500">{CLASS_FILE.formats}</span>
        </button>
      </div>
    );
  }

  const tone =
    slot.status === "ready"
      ? "border-emerald-200 bg-emerald-50/50"
      : slot.status === "error"
        ? "border-red-200 bg-red-50/60"
        : "border-slate-200 bg-slate-50";

  return (
    <div
      {...dragProps}
      className={`relative overflow-hidden rounded-2xl border p-4 transition sm:p-5 ${tone} ${
        dragging ? "ring-4 ring-indigo-200" : ""
      } ${slot.status === "checking" ? "shimmer" : ""}`}
    >
      {input}
      <div className="flex items-start gap-4">
        <FileBadge kind="excel" className="h-11 w-11 text-base" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{slot.file.name}</p>
          <p className="text-xs text-slate-500">{formatBytes(slot.file.size)}</p>

          <div className="mt-2.5" aria-live="polite">
            {slot.status === "checking" && (
              <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Spinner className="h-4 w-4 text-indigo-600" />
                파일 내용을 확인하고 있어요…
              </p>
            )}
            {slot.status === "ready" && (
              <div className="text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-emerald-700">
                  <CheckIcon className="h-4 w-4" strokeWidth={3} />
                  {slot.summary}
                </p>
                {slot.details.filter(Boolean).map((d) => (
                  <p key={d} className="mt-0.5 pl-[22px] text-slate-500">
                    {d}
                  </p>
                ))}
              </div>
            )}
            {slot.status === "error" && (
              <div role="alert" className="text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-red-700">
                  <AlertIcon className="h-4 w-4" />이 파일은 사용할 수 없어요
                </p>
                <p className="mt-0.5 pl-[22px] text-red-700/90">{slot.message}</p>
              </div>
            )}
          </div>
        </div>
        {slot.status !== "checking" && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-600"
            aria-label="파일 지우기"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {slot.status !== "checking" && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={pick}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              slot.status === "error"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
          >
            다른 파일 선택
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 최종 확인 목록
function ReviewList({
  studentCount,
  classSlot,
  onEdit,
}: {
  studentCount: number;
  classSlot: Extract<SlotState, { status: "ready" }>;
  onEdit: (i: number) => void;
}) {
  return (
    <div className="fade-up mt-6">
      <p className="text-sm font-semibold text-slate-700">준비된 내용</p>
      <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
        <li className="flex items-center gap-3 px-4 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white" aria-hidden="true">
            <PencilIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400">1. 특수학생 정보</p>
            <p className="truncate text-sm font-medium text-slate-800">직접 입력 · {studentCount}명</p>
          </div>
          <button
            type="button"
            onClick={() => onEdit(0)}
            className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
          >
            변경
          </button>
        </li>
        <li className="flex items-center gap-3 px-4 py-3">
          <FileBadge kind="excel" className="h-8 w-8 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400">2. 학급 시간표</p>
            <p className="truncate text-sm font-medium text-slate-800">{classSlot.file.name}</p>
          </div>
          <span className="hidden text-xs text-emerald-700 sm:block">{classSlot.summary}</span>
        </li>
      </ul>
    </div>
  );
}
