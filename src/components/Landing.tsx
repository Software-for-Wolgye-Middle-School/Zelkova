import { ArrowRightIcon } from "./icons";
import ZelkovaScene from "./ZelkovaScene";

const primary =
  "group inline-flex items-center justify-center gap-2.5 rounded-full bg-indigo-600 px-7 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-900/25 transition hover:-translate-y-0.5 hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:text-lg";
const secondary =
  "group inline-flex items-center justify-center gap-2.5 rounded-full bg-white/90 px-7 py-4 text-base font-semibold shadow-lg shadow-emerald-900/15 ring-1 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:text-lg";

export default function Landing({
  onStartTimetable,
  onStartPromise,
  onStartBankbook,
  onStartNameTag,
  onStartMeal,
  onStartStudents,
}: {
  onStartTimetable: () => void;
  onStartPromise: () => void;
  onStartBankbook: () => void;
  onStartNameTag: () => void;
  onStartMeal: () => void;
  onStartStudents: () => void;
}) {
  const menus = [
    { label: "특수학급 시간표 만들기", onClick: onStartTimetable, className: primary },
    { label: "나와의 약속판 만들기", onClick: onStartPromise, className: `${secondary} text-pink-600 ring-pink-200` },
    { label: "칭찬통장 생성하기", onClick: onStartBankbook, className: `${secondary} text-amber-600 ring-amber-200` },
    { label: "이름표 생성하기", onClick: onStartNameTag, className: `${secondary} text-emerald-700 ring-emerald-200` },
    { label: "급식표 조회하기", onClick: onStartMeal, className: `${secondary} text-sky-700 ring-sky-200` },
    { label: "학생 정보 관리하기", onClick: onStartStudents, className: `${secondary} text-violet-700 ring-violet-200` },
  ];
  return (
    <section className="relative isolate flex flex-1 flex-col overflow-hidden" aria-labelledby="landing-title">
      <ZelkovaScene className="absolute inset-0 -z-10 h-full w-full" />

      <div className="fade-up mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-end px-4 pb-10 text-center">
        <h1 id="landing-title" className="sr-only">
          느티나무 교실 도우미
        </h1>
        <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          {menus.map((m) => (
            <button key={m.label} type="button" onClick={m.onClick} className={m.className}>
              {m.label}
              <ArrowRightIcon className="h-5 w-5 transition group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
