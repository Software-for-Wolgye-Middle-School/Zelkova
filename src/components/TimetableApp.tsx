"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSchedule,
  combineDocx,
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
import { DEFAULT_TEMPLATE_URL, type SlotState } from "./steps";
import { byGradeClass, DEFAULT_SUBJECTS, fetchServerRows, isBlank, loadRows, saveRows, saveServerRows, syncToTimetable, TIMETABLE_KEY, validateRows, type StudentRow } from "./students";
import { cleanSettings, loadSettings, saveSettings, validateSettings } from "./settings";
import UploadWizard from "./UploadWizard";
import GeneratingScreen from "./GeneratingScreen";
import ResultView from "./ResultView";
import Landing from "./Landing";
import PromiseBoardApp from "./PromiseBoardApp";
import BankbookApp from "./BankbookApp";
import NameTagApp from "./NameTagApp";
import MealApp from "./MealApp";
import StudentsApp from "./StudentsApp";
import HandwritingApp from "./HandwritingApp";
import DutyLogApp from "./DutyLogApp";
import GuideChatApp from "./GuideChatApp";
import IepApp from "./IepApp";

export type StudentDoc = { key: string; student: Student; blob: Blob; fileName: string; hours: number; subjectHours: [string, number][] };

export type GenerationResult = {
  blob: Blob;
  fileName: string;
  title: string;
  schedule: Schedule;
  students: Student[];
  studentDocs: StudentDoc[];
  /** 전체 시간표와 학생별 시간표를 한 파일에 모은 문서 */
  allBlob: Blob;
  allFileName: string;
  classCount: number;
  warnings: string[];
  notes: string[];
};

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim();


/** 과목별 주간 수업 시간 (수강 과목 순서, 수업이 없는 과목은 제외) */
function subjectHours(subjects: string[], slots: Map<string, string>): [string, number][] {
  const values = [...slots.values()];
  return subjects
    .map((s): [string, number] => [s, values.filter((v) => v === s).length])
    .filter(([, n]) => n > 0);
}

/** 학생별 시간표 파일 이름. 이름이 같은 학생이 있으면 학년-반을 붙여 구분 */
function studentFileNames(students: Student[], term: string) {
  const count = new Map<string, number>();
  for (const s of students) count.set(s.name, (count.get(s.name) ?? 0) + 1);
  return students.map((s) => {
    const name = safeName(count.get(s.name)! > 1 ? `${s.name}(${s.grade}-${s.cls})` : s.name);
    return `${name} 특수학급 시간표${term ? ` (${term})` : ""}.docx`;
  });
}

type Phase = "home" | "upload" | "generating" | "result" | "promise" | "bankbook" | "nametag" | "meal" | "students" | "handwriting" | "dutylog" | "guide" | "iep";

/** 각 단계가 너무 빨리 지나가 깜빡이지 않도록 최소 표시 시간 */
const MIN_STAGE_MS = 600;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 서버에서 미리 그린 화면과 맞도록 첫 줄은 고정된 id 로 시작 */
const INITIAL_ROWS: StudentRow[] = [{ id: "initial", grade: "1", cls: "1", name: "", subjects: [...DEFAULT_SUBJECTS] }];

let templateRequest: Promise<ArrayBuffer> | null = null;

/** 기본 양식은 한 번만 내려받아 계속 사용 (실패하면 다음에 다시 시도) */
function loadDefaultTemplate() {
  templateRequest ??= (async () => {
    let res: Response;
    try {
      res = await fetch(DEFAULT_TEMPLATE_URL, { cache: "no-cache" }); // 템플릿을 바꾸면 바로 반영되도록
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
  const [phase, setPhase] = useState<Phase>("home");
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<StudentRow[]>(INITIAL_ROWS); // 학생 정보 관리에 등록한 학생
  const [ttRows, setTtRows] = useState<StudentRow[]>(INITIAL_ROWS); // 시간표에 쓸 학생
  const [settings, setSettings] = useState<TemplateSettings | null>(null);
  const [defaults, setDefaults] = useState<TemplateSettings | null>(null);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [classSlot, setClassSlot] = useState<SlotState>({ status: "empty" });
  const [stage, setStage] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const uploadToken = useRef(0);
  const serverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 서버에 저장된 학생 목록이 있으면 그것을 쓰고, 아직 없으면 이 브라우저의 목록을 서버로 옮김.
   * 서버 학생 정보는 로그인해야 받을 수 있어서, 로그인하지 않았으면 이 브라우저에 저장된 목록을 그대로 씀
   */
  const syncFromServer = useCallback(async () => {
    const saved = loadRows();
    const tt = loadRows(TIMETABLE_KEY) ?? saved?.map((r) => ({ ...r, subjects: [...r.subjects] }));
    const server = await fetchServerRows();
    if (!server) return;
    if (server.length === 0) {
      if (saved) void saveServerRows(saved);
      return;
    }
    setRows(server);
    saveRows(server);
    const nextTt = syncToTimetable(saved ?? [], server, tt ?? []);
    setTtRows(nextTt);
    saveRows(nextTt, TIMETABLE_KEY);
  }, []);

  // 지난번에 입력한 학생 목록 불러오기
  useEffect(() => {
    const saved = loadRows();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 브라우저에서만 읽을 수 있음
    if (saved) setRows(saved);
    // 시간표 학생 목록이 따로 저장돼 있지 않으면 등록한 학생을 그대로 가져옴
    const tt = loadRows(TIMETABLE_KEY) ?? saved?.map((r) => ({ ...r, subjects: [...r.subjects] }));
    if (tt) setTtRows(tt);
    void syncFromServer();
  }, [syncFromServer]);

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

  /** 학생 정보 관리에서 바꾸면 시간표 학생 목록에도 반영 */
  const changeRows = useCallback(
    (next: StudentRow[]) => {
      const nextTt = syncToTimetable(rows, next, ttRows);
      setRows(next);
      saveRows(next);
      if (serverTimer.current) clearTimeout(serverTimer.current);
      serverTimer.current = setTimeout(() => void saveServerRows(next), 400); // 연달아 고칠 때 한 번에 저장
      setTtRows(nextTt);
      saveRows(nextTt, TIMETABLE_KEY);
    },
    [rows, ttRows],
  );

  /** 시간표에서 바꾼 학생 목록은 학생 정보 관리에 영향을 주지 않음 */
  const changeTtRows = useCallback((next: StudentRow[]) => {
    setTtRows(next);
    saveRows(next, TIMETABLE_KEY);
  }, []);

  /** 시간표 만들기를 새로 시작하면 학생 목록을 비움 (등록된 학생은 '등록된 학생 정보 불러오기'로 가져옴) */
  const resetTtRows = useCallback(() => {
    setTtRows(INITIAL_ROWS);
    saveRows(INITIAL_ROWS, TIMETABLE_KEY);
  }, []);

  /**
   * 학생 정보 관리(서버)에 등록한 학생 중 시간표 목록에 아직 없는 학생을 더함.
   * 더한 학생 수를 돌려주고, 로그인하지 않아 서버 목록을 받지 못하면 null
   */
  const importRegistered = useCallback(async (): Promise<number | null> => {
    const server = await fetchServerRows();
    if (!server) return null;
    setRows(server);
    saveRows(server);
    const key = (r: StudentRow) => `${r.grade}|${Number(r.cls)}|${r.name.trim()}`;
    const current = ttRows.filter((r) => !isBlank(r));
    const have = new Set(current.map(key));
    const added = server.filter((r) => !have.has(key(r))).map((r) => ({ ...r, subjects: [...r.subjects] }));
    const next = [...current, ...added].sort(byGradeClass);
    setTtRows(next.length ? next : INITIAL_ROWS);
    saveRows(next.length ? next : INITIAL_ROWS, TIMETABLE_KEY);
    return added.length;
  }, [ttRows]);

  const { students, errors: studentErrors } = useMemo(() => validateRows(ttRows), [ttRows]);
  const registeredStudents = useMemo(() => validateRows(rows).students.sort(byGradeClass), [rows]);

  /** 학생 정보 관리(서버)에 등록한 학생을 새로 받아 옴 (약속판 · 칭찬통장의 불러오기). 로그인하지 않았으면 null */
  const loadRegistered = useCallback(async (): Promise<Student[] | null> => {
    const server = await fetchServerRows();
    if (!server) return null;
    setRows(server);
    saveRows(server);
    return validateRows(server).students.sort(byGradeClass);
  }, []);

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
            blob: await fillStudentTemplate(template, schedule, slots, info, student.name),
            fileName: names[i],
            hours: slots.size,
            subjectHours: subjectHours(student.subjects, slots),
          });
        }
        return docs;
      });

      const allFileName = `${safeName(title)} (전체 + 학생별).docx`;
      const allBlob = await runStage(4, () => combineDocx([blob, ...studentDocs.map((d) => d.blob)]));

      setResult({
        blob,
        fileName,
        title,
        schedule,
        students,
        studentDocs,
        allBlob,
        allFileName,
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

  /** 시간표 메뉴: 만든 결과가 있으면 결과 화면으로, 없으면 입력 단계로 */
  /** 기본 정보와 학생 목록은 저장해 두고, 지난 결과와 학급 시간표는 비운 채 처음 단계로 */
  const restart = useCallback(() => {
    uploadToken.current++;
    setClassSlot({ status: "empty" });
    setResult(null);
    setStep(0);
    resetTtRows();
    setPhase("upload");
  }, [resetTtRows]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="relative z-40 print:hidden border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={phase === "generating" ? undefined : () => setPhase("home")}
            aria-label="메인 화면으로"
            className="flex items-center gap-2.5 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"
          >
            <span className="grid h-8 w-8 grid-cols-2 gap-0.5 rounded-lg bg-indigo-600 p-1.5" aria-hidden="true">
              <span className="rounded-[2px] bg-white/90" />
              <span className="rounded-[2px] bg-white/50" />
              <span className="rounded-[2px] bg-white/50" />
              <span className="rounded-[2px] bg-white/90" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">느티나무 교실 도우미</span>
          </button>
          <DevContact />
        </div>
      </header>

      {phase === "home" ? (
        // 시간표는 메인 화면에서 다시 열면 지난 결과 없이 항상 처음 단계부터, 나머지는 도구 id 가 곧 화면 이름
        <Landing onOpen={(id) => (id === "timetable" ? restart() : setPhase(id))} />
      ) : (
        <>
          <main className={`mx-auto w-full flex-1 px-4 sm:px-6 print:max-w-none print:p-0 ${phase === "iep" ? "max-w-6xl py-0 sm:py-0" : "max-w-5xl py-8 sm:py-12"}`}>
            {phase === "upload" && (
              <UploadWizard
                step={step}
                onStepChange={setStep}
                settings={settings}
                defaults={defaults}
                settingsLoadError={settingsLoadError}
                onSettingsChange={changeSettings}
                settingsErrors={settingsErrors}
                rows={ttRows}
                onRowsChange={changeTtRows}
                onImportStudents={importRegistered}
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
            {phase === "promise" && <PromiseBoardApp students={registeredStudents} onLoadStudents={loadRegistered} />}
            {phase === "bankbook" && <BankbookApp students={registeredStudents} onLoadStudents={loadRegistered} />}
            {phase === "nametag" && <NameTagApp students={registeredStudents} />}
            {phase === "students" && (
              <StudentsApp rows={rows} onRowsChange={changeRows} onAuthed={() => void syncFromServer()} onExit={() => setPhase("home")} />
            )}
            {phase === "handwriting" && <HandwritingApp />}
            {phase === "meal" && <MealApp />}
            {phase === "dutylog" && <DutyLogApp />}
            {phase === "guide" && <GuideChatApp />}
            {phase === "iep" && <IepApp />}
          </main>
        </>
      )}
    </div>
  );
}

const DEV_EMAIL = "kjuho2021@gmail.com";

/** 오른쪽 위 「개발자 연락하기」: 누르면 아래에 이메일 주소가 뜨고, 메일 쓰기 · 주소 복사를 할 수 있음 */
function DevContact() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(DEV_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 복사가 막힌 브라우저에서는 주소를 보고 직접 적으면 됨
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
      >
        개발자 연락하기
      </button>
      {open && (
        <div role="dialog" aria-label="개발자 연락처" className="fade-up absolute right-0 top-full z-50 mt-2 w-72 rounded-xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
          <p className="text-xs font-semibold text-slate-500">개발자 이메일</p>
          <p className="mt-1 select-all break-all text-[15px] font-semibold text-slate-900">{DEV_EMAIL}</p>
          <div className="mt-3 flex gap-2">
            <a href={`mailto:${DEV_EMAIL}`} className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-indigo-700">
              메일 쓰기
            </a>
            <button type="button" onClick={() => void copy()} className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
              {copied ? "✓ 복사했어요" : "주소 복사"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
