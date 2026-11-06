"use client";

import { useMemo, useRef, useState } from "react";
import { clampPromise, promiseBoardsFileName, PROMISE_LINE_CHARS, PROMISE_MAX_LINES, type PromiseBoardRequest } from "@/lib/promiseBoard";
import { BOARD_H, BOARD_W, boardSvg, boardsPdf } from "@/lib/promiseBoardSvg";
import { downloadBlob } from "@/lib/svgExport";
import type { Student } from "@/lib/timetable";
import ImportStudentsButton from "./ImportStudentsButton";
import NameCombobox from "./NameCombobox";
import { DownloadIcon, PlusIcon, Spinner, TrashIcon } from "./icons";
import { SlideCarousel, StepHeading, StepNav, StepProgress, useStepFlow, useSwap } from "./StepFlow";
import { useShake } from "./useShake";

/** 고를 수 있는 연도: 2026년 ~ 2036년 */
const BOARD_YEARS = Array.from({ length: 11 }, (_, i) => 2026 + i);
const MAX_STUDENTS = 40;

function defaultMonth() {
  const now = new Date();
  // 달의 후반이면 다음 달 약속판을 만드는 경우가 많음
  const d = now.getDate() > 20 ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : now;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 약속판을 만드는 순서 */
const STEPS = [
  { title: "날짜", heading: "몇 월 약속판인가요?" },
  { title: "학생", heading: "학생" },
  { title: "다운받기", heading: "미리 보고 내려받아요" },
] as const;

type Entry = { id: number; name: string; promise: string };

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 12);
const isBlank = (e: Entry) => !e.name.trim() && !e.promise.trim();

export default function PromiseBoardApp({ students, onLoadStudents }: { students: Student[]; onLoadStudents: () => Promise<Student[] | null> }) {
  const { step, fadeFrom, fadeTo, fading, checking, goStep, goNext, fadeClass } = useStepFlow();
  /** 학생을 바꿀 때: 왼쪽 입력은 위에서 아래로, 미리보기는 제자리에서 사라졌다 나타남 */
  const studentSwap = useSwap();
  const [{ year, month }, setYm] = useState(defaultMonth);
  const [entries, setEntries] = useState<Entry[]>([{ id: 0, name: "", promise: "" }]);
  const [current, setCurrent] = useState(0);
  const nextId = useRef(1);
  const addShake = useShake();
  const [addBlocked, setAddBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const savedNames = useMemo(() => [...new Set(students.map((s) => s.name))].sort((a, b) => a.localeCompare(b, "ko")), [students]);

  const entry = entries[Math.min(current, entries.length - 1)];
  const reqOf = (e: Entry): PromiseBoardRequest => ({ name: cleanName(e.name) || "○○○", year, month, promise: e.promise ? e.promise.split("\n") : [] });
  const update = (patch: Partial<Entry>) => setEntries((list) => list.map((e) => (e.id === entry.id ? { ...e, ...patch } : e)));

  const named = entries.filter((e) => cleanName(e.name));
  const reqs = named.map(reqOf);
  const currentSvg = boardSvg(reqOf(entry));
  const boardSvgs = reqs.map((r) => boardSvg(r));

  /** 학생 정보 관리에 등록한 학생을 학생 1, 2, 3… 으로 넣음 (이미 있는 이름은 건너뜀, 약속은 비어 있음) */
  const importStudents = async () => {
    const list = await onLoadStudents();
    if (!list) return null;
    const have = new Set(entries.map((e) => cleanName(e.name)).filter(Boolean));
    const toAdd = [...new Set(list.map((s) => cleanName(s.name)))].filter((n) => n && !have.has(n)).sort((a, b) => a.localeCompare(b, "ko"));
    if (!toAdd.length) return list.length ? "등록된 학생이 이미 모두 들어 있어요." : "학생 정보 관리에 등록된 학생이 없어요.";
    const kept = entries.filter((e) => !isBlank(e));
    const next = [...kept, ...toAdd.map((name) => ({ id: nextId.current++, name, promise: "" }))];
    setEntries(next);
    // 비어 있던 칸에서 불러왔으면 불러온 첫 학생을 보여 줌
    setCurrent(isBlank(entry) ? kept.length : Math.max(0, next.findIndex((e) => e.id === entry.id)));
    return `학생 정보 관리에서 ${toAdd.length}명을 불러왔어요.`;
  };

  /** 지금 학생을 두고 다음 학생 칸을 새로 엶 */
  const addStudent = () =>
    studentSwap.swap(() => {
      setEntries((list) => [...list, { id: nextId.current++, name: "", promise: "" }]);
      setCurrent(entries.length);
    });
  const showStudent = (i: number) => i !== current && studentSwap.swap(() => setCurrent(i));
  const removeStudent = () =>
    studentSwap.swap(() => {
      setEntries((list) => list.filter((e) => e.id !== entry.id));
      setCurrent((c) => Math.max(0, Math.min(c, entries.length - 2)));
    });

  /** 학생 단계에서 '다음': 이름을 적은 학생만 남기고 미리보기로 */
  const next = () =>
    goNext(
      step === 1
        ? () => {
            setEntries((list) => list.filter((e) => cleanName(e.name)));
            setCurrent(0);
          }
        : undefined,
    );

  const download = async () => {
    setBusy(true);
    setExportError(null);
    try {
      downloadBlob(await boardsPdf(reqs), promiseBoardsFileName(reqs));
    } catch (e) {
      console.error(e);
      setExportError("PDF로 저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const last = step === STEPS.length - 1;
  // 이름을 적은 학생이 있어야 하고, 이름 없이 약속만 적은 학생은 없어야 함 (아예 빈 칸은 건너뜀)
  const canNext = step === 1 ? named.length > 0 && entries.every((e) => cleanName(e.name) || isBlank(e)) : true;
  const heading =
    step === 1 ? { ...STEPS[1], heading: `학생 ${current + 1}`, hint: "이름과 이 달의 약속을 적어 주세요. 학생을 더 추가하거나 다음으로 넘어가요." } : STEPS[step];
  const singleView = (s: number) => s < 2;

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">나와의 약속판 만들기</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="h-fit space-y-5 overflow-x-clip rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <StepProgress steps={STEPS} step={step} checking={checking} onGo={goStep} />

          <div className={`space-y-5 ${fadeClass}`}>
            <div className={step === 1 ? studentSwap.downClass : ""}>
              <StepHeading step={heading} />
            </div>

            {step === 0 && (
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="연도" value={year} onChange={(e) => setYm({ year: Number(e.target.value), month })} className={field}>
                  {BOARD_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
                <select aria-label="월" value={month} onChange={(e) => setYm({ year, month: Number(e.target.value) })} className={field}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}월
                    </option>
                  ))}
                </select>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <ImportStudentsButton onImport={importStudents} />
                {entries.length > 1 && (
                  <div className="flex flex-wrap gap-1.5" aria-label="입력한 학생">
                    {entries.map((e, i) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => showStudent(i)}
                        aria-pressed={i === current}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                          i === current ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {i + 1}. {cleanName(e.name) || "이름 없음"}
                      </button>
                    ))}
                  </div>
                )}
                {/* 학생마다 바뀌는 부분만 움직임 (불러오기 버튼 · 학생 목록은 그대로) */}
                <div className={`space-y-4 ${studentSwap.downClass}`}>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="pb-name">
                    이름
                  </label>
                  <NameCombobox
                    key={entry.id}
                    id="pb-name"
                    value={entry.name}
                    onChange={(name) => update({ name })}
                    names={savedNames}
                    maxLength={12}
                    placeholder="예: 이순신"
                    className={field}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="pb-promise">
                    이 달의 약속
                  </label>
                  <textarea
                    id="pb-promise"
                    value={entry.promise}
                    rows={Math.max(2, entry.promise.split("\n").length)}
                    autoComplete="off"
                    placeholder={"예: 매일 책 10쪽 읽기\n(Enter를 누르면 다음 줄에 쓸 수 있어요)"}
                    onChange={(e) => update({ promise: clampPromise(e.target.value) })}
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[15px] leading-6 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    한 줄에 {PROMISE_LINE_CHARS}자까지, 최대 {PROMISE_MAX_LINES}줄까지 쓸 수 있어요.
                  </p>
                </div>
                {entries.length > 1 && (
                  <button
                    type="button"
                    onClick={removeStudent}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    학생 {current + 1} 제거
                  </button>
                )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <p className="mb-3 text-sm text-slate-600">
                  {year}년 {month}월 · 학생 {reqs.length}명의 약속판을 PDF 파일 하나에 한 쪽씩 담아요.
                </p>
                <button
                  type="button"
                  onClick={download}
                  disabled={busy || reqs.length === 0}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  {busy ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
                  PDF 다운로드
                </button>
                {exportError && (
                  <p role="alert" className="mt-2 text-center text-xs font-medium text-red-600">
                    {exportError}
                  </p>
                )}
              </div>
            )}
          </div>

          <StepNav
            step={step}
            last={last}
            canNext={canNext}
            checking={checking}
            onPrev={() => goStep(step - 1)}
            onNext={next}
            invalidMessage={named.length ? "이름 없이 약속만 적은 학생이 있어요. 이름을 적거나 그 학생을 제거해 주세요." : "이름을 입력해 주세요."}
            extra={
              step === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    if (checking) return;
                    // 이름을 안 쓰고 누르면 흔들리며 알려 줌
                    if (!cleanName(entry.name)) {
                      setAddBlocked(true);
                      return addShake.shake();
                    }
                    setAddBlocked(false);
                    addStudent();
                  }}
                  aria-disabled={!cleanName(entry.name) || checking}
                  disabled={entries.length >= MAX_STUDENTS}
                  className={`inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 aria-disabled:cursor-not-allowed aria-disabled:text-slate-400 ${addShake.shakeClass}`}
                >
                  <PlusIcon className="h-4 w-4" />
                  추가하기
                </button>
              )
            }
          />
          {step === 1 && addBlocked && !cleanName(entry.name) && (
            <p role="alert" className="-mt-3 text-right text-xs font-medium text-red-600">
              이름을 입력하면 학생을 추가할 수 있어요.
            </p>
          )}
        </div>

        {/* 날짜 · 학생 단계는 지금 학생의 약속판, 마지막 단계는 모든 학생을 넘겨 보기. 같은 화면이면 단계를 옮겨도 그대로 둠 */}
        <section
          aria-label="약속판 미리보기"
          className={`min-w-0 ${fading && singleView(fadeFrom) !== singleView(fadeTo) ? fadeClass : studentSwap.fadeClass}`}
        >
          {step === 2 ? (
            <SlideCarousel
              count={boardSvgs.length}
              caption={(i) => `${i + 1}/${boardSvgs.length} · ${reqs[i]?.name ?? ""}`}
              aspectRatio={`${BOARD_W} / ${BOARD_H}`}
              maxWidth={452}
              slideClassName="overflow-hidden rounded-md bg-white shadow-md"
              render={(i) => (
                <div
                  className="h-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                  // boardSvg 는 이름을 XML 이스케이프한 뒤 직접 만든 SVG 문자열
                  dangerouslySetInnerHTML={{ __html: boardSvgs[i] ?? "" }}
                />
              )}
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-6">
              <div
                className="mx-auto max-w-[620px] overflow-hidden rounded-md bg-white shadow-md [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                role="img"
                aria-label={`${reqOf(entry).name}의 ${year}년 ${month}월 나와의 약속판 미리보기`}
                dangerouslySetInnerHTML={{ __html: currentSvg }}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
