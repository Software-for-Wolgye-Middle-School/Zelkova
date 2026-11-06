"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TrashIcon } from "./icons";

/**
 * 지우기처럼 되돌릴 수 없는 일을 하기 전에 묻는 창 (화면 전체를 어둡게 덮음).
 * 페이지의 등장 애니메이션 안에 있으면 화면 전체를 덮지 못하므로 body 에 바로 그림.
 * 취소 버튼에 먼저 초점, Esc 나 바깥을 누르면 닫힘
 */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const latestCancel = useRef(onCancel);
  useEffect(() => {
    latestCancel.current = onCancel;
  });

  // 창이 열릴 때 한 번만: 취소에 초점, Esc 로 닫기
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && latestCancel.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc" className="fade-up w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-600">
          <TrashIcon className="h-5 w-5" />
        </span>
        <h2 id="confirm-title" className="mt-4 text-lg font-bold text-slate-900">
          {title}
        </h2>
        <p id="confirm-desc" className="mt-1.5 text-sm text-slate-600">
          {children}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancel} type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
            취소
          </button>
          <button type="button" onClick={onConfirm} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
