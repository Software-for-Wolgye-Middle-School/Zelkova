"use client";

import { useCallback, useEffect, useState } from "react";
import { NOTICE_BOARD_URL, type MealLink } from "@/lib/meal";
import { AlertIcon, DownloadIcon, RefreshIcon, Spinner } from "./icons";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; link: MealLink | null };

/**
 * 급식표 조회하기: 월계중학교 가정통신문 게시판에서 이번 달 급식 안내를 찾아 링크만 보여 줌.
 * 식단표 파일을 읽지 않아 빠르고, 서버에 아무것도 저장하지 않음 (열 때마다 학교 홈페이지에서 새로 검색).
 */
export default function MealApp() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/meals", { cache: "no-store" });
      const data = (await res.json()) as { link?: MealLink | null; error?: string };
      if (!res.ok) throw new Error(data.error);
      setState({ status: "ready", link: data.link ?? null });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error && e.message ? e.message : "급식 안내를 찾지 못했어요." });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 화면을 열면 학교 홈페이지에서 바로 찾음
    load();
  }, [load]);

  const boardLink = (
    <a
      href={NOTICE_BOARD_URL}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      가정통신문 게시판 열기 ↗
    </a>
  );

  return (
    <div className="fade-up mx-auto max-w-xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">급식표 조회하기</h1>
        <p className="mt-2 text-[15px] text-slate-500">월계중학교 가정통신문에 올라온 이번 달 급식 안내를 찾아 드려요.</p>
      </div>

      {state.status === "loading" && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500" role="status">
          <Spinner className="h-8 w-8 text-indigo-600" />
          <p className="text-[15px]">월계중학교 홈페이지에서 찾고 있어요…</p>
        </div>
      )}

      {state.status === "error" && (
        <div role="alert" className="flex flex-col items-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertIcon className="h-8 w-8 text-red-500" />
          <p className="text-[15px] font-medium text-red-700">{state.message}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700">
              <RefreshIcon className="h-4 w-4" />
              다시 찾기
            </button>
            {boardLink}
          </div>
        </div>
      )}

      {state.status === "ready" && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {state.link ? (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-500">
                  {state.link.thisMonth ? "이번 달 급식 안내" : "이번 달 급식 안내는 아직 올라오지 않았어요 · 가장 최근 급식 안내"}
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">{state.link.title}</p>
                <p className="text-sm text-slate-500">{state.link.date} 가정통신문</p>
              </div>
              <div className="flex flex-col gap-2">
                {state.link.files.map((f) => (
                  <a
                    key={f.url}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700"
                  >
                    <DownloadIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </a>
                ))}
                {boardLink}
              </div>
            </>
          ) : (
            <>
              <p className="text-center text-[15px] text-slate-500">가정통신문 게시판에서 급식 안내를 찾지 못했어요.</p>
              {boardLink}
            </>
          )}
        </div>
      )}
    </div>
  );
}
