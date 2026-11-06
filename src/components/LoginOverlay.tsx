"use client";

import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { login } from "./auth";
import { EyeIcon, EyeOffIcon, LockIcon, Spinner } from "./icons";
import { useShake } from "./useShake";

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 화면 가운데 로그인 창 (뒤 화면 전체를 흐리게). 시간표에서 등록된 학생을 불러올 때도 씀 */
export default function LoginOverlay({
  checking = false,
  onSuccess,
  onExit,
  exitLabel = "메인 화면으로",
}: {
  checking?: boolean;
  onSuccess: () => void;
  onExit: () => void;
  exitLabel?: string;
}) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { shake, shakeClass } = useShake();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !password) {
      setError("아이디와 비밀번호를 입력해 주세요.");
      return shake();
    }
    setBusy(true);
    setError(null);
    const result = await login(id, password);
    setBusy(false);
    if (result.ok) onSuccess();
    else {
      setError(result.error);
      setPassword("");
      shake();
    }
  };

  // 페이지의 등장 애니메이션 안에 있으면 화면 전체를 덮지 못하므로 body 에 바로 그림
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-white/30 p-4 backdrop-blur-md">
      {checking ? (
        <Spinner className="h-8 w-8 text-indigo-600" />
      ) : (
        <form
          onSubmit={submit}
          aria-labelledby="login-title"
          className="fade-up w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-7"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-indigo-50 text-indigo-600">
            <LockIcon className="h-5 w-5" />
          </span>
          <h2 id="login-title" className="mt-4 text-lg font-bold text-slate-900">
            학생 정보 관리
          </h2>
          <p className="mt-1 text-sm text-slate-500">아이디와 비밀번호를 입력해 주세요.</p>
          {/* 확인하는 동안에는 입력을 막아 결과가 돌아올 때 새로 쓴 비밀번호가 지워지지 않게 함 */}
          <fieldset disabled={busy} className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">아이디</span>
              <input value={id} autoFocus autoComplete="username" onChange={(e) => setId(e.target.value)} className={field} />
            </label>
            <div>
              <label htmlFor="login-password" className="mb-1 block text-xs font-semibold text-slate-600">
                비밀번호
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${field} pr-11`}
                />
                {/* 눈 모양을 누르면 입력한 비밀번호를 보거나 다시 가림 */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "비밀번호 가리기" : "비밀번호 보기"}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  {/* 지금 상태를 보여 줌: 가려져 있으면 빗금 친 눈, 보이면 뜬 눈 */}
                  {showPassword ? <EyeIcon className="h-5 w-5" /> : <EyeOffIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </fieldset>
          {error && (
            <p id="login-error" role="alert" className="mt-3 text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70 ${shakeClass}`}
          >
            {busy && <Spinner className="h-5 w-5" />}
            로그인
          </button>
          <button type="button" onClick={onExit} className="mt-2 w-full rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100">
            {exitLabel}
          </button>
        </form>
      )}
    </div>,
    document.body,
  );
}
