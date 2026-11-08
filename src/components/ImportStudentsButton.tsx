"use client";

import { useState } from "react";
import { DownloadIcon, Spinner } from "./icons";
import LoginOverlay from "./LoginOverlay";

/**
 * '등록된 학생 정보 불러오기' 버튼 (시간표 · 약속판에서 함께 씀).
 * onImport 는 불러온 뒤 보여 줄 문구를 돌려주고, 로그인하지 않아 서버 학생 정보를 받지 못하면 null.
 * null 이면 로그인 창을 띄우고, 로그인하면 이어서 다시 불러옴
 */
export default function ImportStudentsButton({ onImport, className = "" }: { onImport: () => Promise<string | null>; className?: string }) {
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  const run = async () => {
    setImporting(true);
    setNote(null);
    const message = await onImport();
    setImporting(false);
    if (message === null) setNeedLogin(true);
    else setNote(message);
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <button
        type="button"
        onClick={run}
        disabled={importing}
        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-70"
      >
        {importing ? <Spinner className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
        등록된 학생 정보 불러오기
      </button>
      {note && (
        <span role="status" className="text-xs font-medium text-emerald-700">
          {note}
        </span>
      )}
      {needLogin && (
        <LoginOverlay
          exitLabel="닫기"
          onExit={() => setNeedLogin(false)}
          onSuccess={() => {
            setNeedLogin(false);
            void run();
          }}
        />
      )}
    </div>
  );
}
