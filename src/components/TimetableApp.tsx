"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  buildSchedule,
  fillStudentTemplate,
  fillTemplate,
  inspectClassTimetables,
  readClassTimetables,
  readTemplateSettings,
  studentSlots,
  TimetableError,
  titleFor,
  type Schedule,
  type Student,
  type TemplateSettings,
} from "@/lib/timetable";
import { LockIcon } from "./icons";
import { DEFAULT_TEMPLATE_URL, type SlotState } from "./steps";
import { loadRows, saveRows, SUBJECTS, validateRows, type StudentRow } from "./students";
import { cleanSettings, loadSettings, saveSettings, validateSettings } from "./settings";
import UploadWizard from "./UploadWizard";
import GeneratingScreen from "./GeneratingScreen";
import ResultView from "./ResultView";

export type StudentDoc = { key: string; student: Student; blob: Blob; fileName: string; hours: number };

export type GenerationResult = {
  blob: Blob;
  fileName: string;
  title: string;
  schedule: Schedule;
  students: Student[];
  studentDocs: StudentDoc[];
  zipBlob: Blob;
  zipFileName: string;
  classCount: number;
  warnings: string[];
  notes: string[];
};

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim();


/** 학생별 시간표 파일 이름. 이름이 같은 학생이 있으면 학년-반을 붙여 구분 */
function studentFileNames(students: Student[], term: string) {
  const count = new Map<string, number>();
  for (const s of students) count.set(s.name, (count.get(s.name) ?? 0) + 1);
  return students.map((s) => {
    const name = safeName(count.get(s.name)! > 1 ? `${s.name}(${s.grade}-${s.cls})` : s.name);
    return `${name} 특수학급 시간표${term ? ` (${term})` : ""}.docx`;
  });
}

type Phase = "upload" | "generating" | "result";

/** 각 단계가 너무 빨리 지나가 깜빡이지 않도록 최소 표시 시간 */
const MIN_STAGE_MS = 600;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 서버에서 미리 그린 화면과 맞도록 첫 줄은 고정된 id 로 시작 */
const INITIAL_ROWS: StudentRow[] = [{ id: "initial", grade: "1", cls: "", name: "", subjects: [...SUBJECTS] }];

let templateRequest: Promise<ArrayBuffer> | null = null;

/** 기본 양식은 한 번만 내려받아 계속 사용 (실패하면 다음에 다시 시도) */
function loadDefaultTemplate() {
  templateRequest ??= (async () => {
    let res: Response;
    try {
      res = await fetch(DEFAULT_TEMPLATE_URL);
    } catch {
      throw new TimetableError("기본 시간표 양식을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
    }
    if (!res.ok) throw new TimetableError("기본 시간표 양식 파일을 찾을 수 없습니다.");
    return res.arrayBuffer();
  })().catch((e) => {
    templateRequest = null;
    throw e;
  });
  return templateRequest;
}

export default function TimetableApp() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<StudentRow[]>(INITIAL_ROWS);
  const [settings, setSettings] = useState<TemplateSettings | null>(null);
  const [defaults, setDefaults] = useState<TemplateSettings | null>(null);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [classSlot, setClassSlot] = useState<SlotState>({ status: "empty" });
  const [stage, setStage] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const uploadToken = useRef(0);

  // 지난번에 입력한 학생 목록 불러오기
  useEffect(() => {
    const saved = loadRows();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 브라우저에서만 읽을 수 있음
    if (saved) setRows(saved);
  }, []);

  // 양식에서 학년도 · 학기 · 선생님 기본값을 읽고, 지난번 바꾼 값을 덮어씀
  useEffect(() => {
    loadDefaultTemplate()
      .then(readTemplateSettings)
      .then((def) => {
        setDefaults(def);
        setSettings(loadSettings(def));
      })
      .catch((e) => {
        if (!(e instanceof TimetableError)) console.error(e);
        setSettingsLoadError(e instanceof TimetableError ? e.message : "기본 시간표 양식을 읽지 못했습니다.");
      });
  }, []);

  const changeSettings = useCallback((next: TemplateSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const settingsErrors = useMemo(() => (settings ? validateSettings(settings) : new Map<string, string>()), [settings]);

  const changeRows = useCallback((next: StudentRow[]) => {
    setRows(next);
    saveRows(next);
  }, []);

  const { students, errors: studentErrors } = useMemo(() => validateRows(rows), [rows]);

  const handleFile = useCallback(async (file: File) => {
    const token = ++uploadToken.current;
    setGenError(null);
    setClassSlot({ status: "checking", file });
    let next: SlotState;
    try {
      const [buf] = await Promise.all([file.arrayBuffer(), delay(350)]);
      next = { status: "ready", file, buf, ...inspectClassTimetables(buf) };
    } catch (e) {
      const message =
        e instanceof TimetableError ? e.message : "파일을 확인하는 중 문제가 생겼습니다. 다른 파일로 다시 시도해 주세요.";
      if (!(e instanceof TimetableError)) console.error(e);
      next = { status: "error", file, message };
    }
    if (token !== uploadToken.current) return; // 그 사이 다른 파일을 올린 경우
    setClassSlot(next);
  }, []);

  const clearFile = useCallback(() => {
    uploadToken.current++;
    setClassSlot({ status: "empty" });
  }, []);

  const generate = useCallback(async () => {
    if (classSlot.status !== "ready" || students.length === 0 || studentErrors.size > 0) return;
    if (!settings || settingsErrors.size > 0) return;
    const classBuf = classSlot.buf;
    const info = cleanSettings(settings);

    const runStage = async <T,>(i: number, fn: () => T | Promise<T>): Promise<T> => {
      setStage(i);
      const [value] = await Promise.all([Promise.resolve().then(fn), delay(MIN_STAGE_MS)]);
      return value;
    };

    setGenError(null);
    setStage(0);
    setPhase("generating");
    try {
      const { classTt, template } = await runStage(0, async () => ({
        classTt: readClassTimetables(classBuf),
        template: await loadDefaultTemplate(),
      }));
      const { schedule, warnings } = await runStage(1, () => buildSchedule(classTt, students));
      const { blob, notes } = await runStage(2, () => fillTemplate(template, schedule, info));
      const title = titleFor(info);
      const term = `${info.year}년 ${info.term}학기`;
      const fileName = `${safeName(title)}.docx`;

      const studentDocs = await runStage(3, async () => {
        const names = studentFileNames(students, term);
        const docs: StudentDoc[] = [];
        for (const [i, student] of students.entries()) {
          const slots = studentSlots(classTt, student);
          if (!slots) continue; // 학급 시간표가 없는 학생은 warnings 로 안내됨
          docs.push({
            key: `${student.grade}-${student.cls}-${student.name}-${i}`,
            student,
            blob: await fillStudentTemplate(template, schedule, slots, info),
            fileName: names[i],
            hours: slots.size,
          });
        }
        return docs;
      });

      const zipFileName = `특수학급 시간표 (${term}).zip`;
      const zipBlob = await runStage(4, () => {
        const zip = new JSZip();
        zip.file(fileName, blob);
        const folder = zip.folder("학생별 시간표")!;
        for (const d of studentDocs) folder.file(d.fileName, d.blob);
        return zip.generateAsync({ type: "blob" });
      });

      setResult({
        blob,
        fileName,
        title,
        schedule,
        students,
        studentDocs,
        zipBlob,
        zipFileName,
        classCount: classTt.size,
        warnings,
        notes,
      });
      setPhase("result");
    } catch (e) {
      if (!(e instanceof TimetableError)) console.error(e);
      setGenError(
        e instanceof TimetableError ? e.message : "시간표를 만드는 중 예상하지 못한 문제가 생겼습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.",
      );
      setPhase("upload");
    }
  }, [classSlot, students, studentErrors, settings, settingsErrors]);

  /** 기본 정보와 학생 목록은 저장해 두고, 학급 시간표만 비운 채 처음 단계로 */
  const restart = useCallback(() => {
    uploadToken.current++;
    setClassSlot({ status: "empty" });
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
            입력한 정보는 이 컴퓨터 밖으로 전송되지 않아요
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {phase === "upload" && (
          <UploadWizard
            step={step}
            onStepChange={setStep}
            settings={settings}
            defaults={defaults}
            settingsLoadError={settingsLoadError}
            onSettingsChange={changeSettings}
            settingsErrors={settingsErrors}
            rows={rows}
            onRowsChange={changeRows}
            studentErrors={studentErrors}
            studentCount={students.length}
            classSlot={classSlot}
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

      <footer className="px-4 pb-6 text-center text-xs text-slate-400">모든 처리는 브라우저 안에서 이루어집니다.</footer>
    </div>
  );
}
