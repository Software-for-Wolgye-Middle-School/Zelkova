import { ArrowRightIcon } from "./icons";
import ZelkovaScene from "./ZelkovaScene";

export default function Landing({
  onStartTimetable,
  onStartPromise,
}: {
  onStartTimetable: () => void;
  onStartPromise: () => void;
}) {
  return (
    <section className="relative isolate flex flex-1 flex-col overflow-hidden" aria-labelledby="landing-title">
      <ZelkovaScene className="absolute inset-0 -z-10 h-full w-full" />

      <div className="fade-up mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-end px-4 pb-10 text-center">
        <h1 id="landing-title" className="sr-only">
          느티나무 교실 도우미
        </h1>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onStartTimetable}
            className="group inline-flex items-center gap-2.5 rounded-full bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-900/25 transition hover:-translate-y-0.5 hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:text-lg"
          >
            특수학급 시간표 만들기
            <ArrowRightIcon className="h-5 w-5 transition group-hover:translate-x-0.5" />
          </button>
          <button
            type="button"
            onClick={onStartPromise}
            className="group inline-flex items-center gap-2.5 rounded-full bg-white/90 px-8 py-4 text-base font-semibold text-pink-600 shadow-lg shadow-emerald-900/15 ring-1 ring-pink-200 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:text-lg"
          >
            나와의 약속판 만들기
            <ArrowRightIcon className="h-5 w-5 transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
