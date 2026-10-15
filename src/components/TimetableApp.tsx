"use client";

import { useCallback, useRef, useState } from "react";
import {
  buildSchedule,
  fillTemplate,
  readClassTimetables,
  readStudents,
  TimetableError,
  type Schedule,
  type Student,
} from "@/lib/timetable";
import { LockIcon } from "./icons";
import { UPLOAD_STEPS, type SlotState } from "./steps";
import UploadWizard from "./UploadWizard";
import GeneratingScreen, { GENERATING_STAGES } from "./GeneratingScreen";
import ResultView from "./ResultView";

export type GenerationResult = {
  blob: Blob;
  title: string;
  schedule: Schedule;
  students: Student[];
  classCount: number;
  warnings: string[];
  notes: string[];
};

type Phase = "upload" | "generating" | "result";

/** 각 단계가 너무 빨리 지나가 깜빡이지 않도록 최소 표시 시간 */
const MIN_STAGE_MS = 600;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function TimetableApp() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [step, setStep] = useState(0);
  const [slots, setSlots] = useState<SlotState[]>(() => UPLOAD_STEPS.map(() => ({ status: "empty" })));
  const [stage, setStage] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const uploadTokens = useRef<number[]>(UPLOAD_STEPS.map(() => 0));

  const handleFile = useCallback(async (index: number, file: File) => {
    const token = ++uploadTokens.current[index];
    setGenError(null);
    setSlots((s) => s.map((x, i) => (i === index ? { status: "checking", file } : x)));
    let next: SlotState;
    try {
      const [buf] = await Promise.all([file.arrayBuffer(), delay(350)]);
      const check = await UPLOAD_STEPS[index].inspect(buf);
      next = { status: "ready", file, buf, check };
    } catch (e) {
      const message =
        e instanceof TimetableError ? e.message : "파일을 확인하는 중 문제가 생겼습니다. 다른 파일로 다시 시도해 주세요.";
      if (!(e instanceof TimetableError)) console.error(e);
      next = { status: "error", file, message };
    }
    if (token !== uploadTokens.current[index]) return; // 그 사이 다른 파일을 올린 경우
    setSlots((s) => s.map((x, i) => (i === index ? next : x)));
  }, []);

  const clearFile = useCallback((index: number) => {
    uploadTokens.current[index]++;
    setSlots((s) => s.map((x, i) => (i === index ? { status: "empty" } : x)));
  }, []);

  const generate = useCallback(async () => {
    const ready = slots.filter((s) => s.status === "ready");
    if (ready.length !== UPLOAD_STEPS.length) return;
    const [template, studentsFile, classesFile] = ready;

    const runStage = async <T,>(i: number, fn: () => T | Promise<T>): Promise<T> => {
      setStage(i);
      const [value] = await Promise.all([Promise.resolve().then(fn), delay(MIN_STAGE_MS)]);
      return value;
    };

    setGenError(null);
    setStage(0);
    setPhase("generating");
    try {
      const { students, classTt } = await runStage(0, () => ({
        students: readStudents(studentsFile.buf),
        classTt: readClassTimetables(classesFile.buf),
      }));
      const { schedule, warnings } = await runStage(1, () => buildSchedule(classTt, students));
      const { blob, notes } = await runStage(2, () => fillTemplate(template.buf, schedule));
      await runStage(GENERATING_STAGES.length - 1, () => undefined);
      setResult({
        blob,
        title: template.check.title || "특수학급 시간표",
        schedule,
        students,
        classCount: classTt.size,
        warnings,
        notes,
      });
      setPhase("result");
    } catch (e) {
      if (!(e instanceof TimetableError)) console.error(e);
      setGenError(
        e instanceof TimetableError ? e.message : "시간표를 만드는 중 예상하지 못한 문제가 생겼습니다. 파일을 확인한 뒤 다시 시도해 주세요.",
      );
      setPhase("upload");
    }
  }, [slots]);

  const restart = useCallback(() => {
    uploadTokens.current = uploadTokens.current.map((t) => t + 1);
    setSlots(UPLOAD_STEPS.map(() => ({ status: "empty" })));
    setResult(null);
    setStep(0);
    setPhase("upload");
  }, []);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={phase === "generating" ? undefined : restart}
            className="flex items-center gap-2.5 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"
          >
            <span className="grid h-8 w-8 grid-cols-2 gap-0.5 rounded-lg bg-indigo-600 p-1.5" aria-hidden="true">
              <span className="rounded-[2px] bg-white/90" />
              <span className="rounded-[2px] bg-white/50" />
              <span className="rounded-[2px] bg-white/50" />
              <span className="rounded-[2px] bg-white/90" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">특수학급 시간표 생성기</span>
          </button>
          <span className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:inline-flex">
            <LockIcon className="h-3.5 w-3.5" />
            파일은 이 컴퓨터 밖으로 전송되지 않아요
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {phase === "upload" && (
          <UploadWizard
            step={step}
            onStepChange={setStep}
            slots={slots}
            onFile={handleFile}
            onClear={clearFile}
            onGenerate={generate}
            error={genError}
            onDismissError={() => setGenError(null)}
          />
        )}
        {phase === "generating" && <GeneratingScreen stage={stage} />}
        {phase === "result" && result && <ResultView result={result} onRestart={restart} />}
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-slate-400">
        모든 처리는 브라우저 안에서 이루어집니다.
      </footer>
    </div>
  );
}
