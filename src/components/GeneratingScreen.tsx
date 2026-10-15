import { CheckIcon, Spinner } from "./icons";

export const GENERATING_STAGES = [
  { label: "파일 읽는 중", detail: "학급 시간표와 기본 특수학급 시간표 양식을 불러오고 있어요" },
  { label: "수업 시간 맞추는 중", detail: "학생마다 수강 과목이 있는 교시를 찾고 있어요" },
  { label: "전체 시간표 채우는 중", detail: "양식의 칸과 색상은 그대로 두고 학생 이름을 채우고 있어요" },
  { label: "학생별 시간표 만드는 중", detail: "학생마다 개인 시간표를 한 장씩 만들고 있어요" },
  { label: "다운로드 준비 중", detail: "거의 다 됐어요" },
];

const DAYS = ["월", "화", "수", "목", "금"];
const PERIODS = 6;
// 템플릿과 같은 연보라 · 연파랑 톤
const CELL_TONES = ["bg-[#d9c6ea]", "bg-[#c9d6f3]", "bg-indigo-200"];

export default function GeneratingScreen({ stage }: { stage: number }) {
  const current = GENERATING_STAGES[stage] ?? GENERATING_STAGES[0];
  const percent = Math.round(((stage + 1) / GENERATING_STAGES.length) * 100);

  return (
    <div className="fade-up mx-auto flex max-w-md flex-col items-center pt-4 text-center sm:pt-10">
      {/* 시간표 칸이 왼쪽 위부터 차례로 채워지는 그림 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-hidden="true">
        <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1.5">
          <span />
          {DAYS.map((d) => (
            <span key={d} className="pb-0.5 text-[11px] font-semibold text-slate-400">
              {d}
            </span>
          ))}
          {Array.from({ length: PERIODS }, (_, p) => (
            <div key={p} className="contents">
              <span className="pr-1 text-right text-[11px] font-medium leading-6 text-slate-300">{p + 1}</span>
              {DAYS.map((_, d) => (
                <span key={d} className="relative h-6 w-9 rounded-md bg-slate-100 sm:w-11">
                  <span
                    className={`cell-fill absolute inset-0 rounded-md ${CELL_TONES[(p * 5 + d * 2) % 3]}`}
                    style={{ animationDelay: `${(p + d) * 0.12}s` }}
                  />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <h1 className="mt-8 text-xl font-bold tracking-tight text-slate-900">시간표를 만들고 있어요</h1>
      <p className="mt-1.5 min-h-[1.5em] text-[15px] text-slate-500" aria-live="polite">
        {current.detail}
      </p>

      <div
        className="mt-6 h-2 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="시간표 생성 진행률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="mt-6 w-full space-y-1 text-left">
        {GENERATING_STAGES.map((s, i) => {
          const done = i < stage;
          const active = i === stage;
          return (
            <li
              key={s.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active ? "bg-white shadow-sm" : ""}`}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center">
                {done ? (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
                    <CheckIcon className="h-3 w-3" strokeWidth={3.5} />
                  </span>
                ) : active ? (
                  <Spinner className="h-5 w-5 text-indigo-600" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-slate-300" />
                )}
              </span>
              <span className={done ? "text-slate-500" : active ? "font-semibold text-slate-900" : "text-slate-400"}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
