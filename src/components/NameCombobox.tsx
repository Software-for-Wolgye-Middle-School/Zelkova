"use client";

import { useEffect, useRef, useState } from "react";

/** 이름을 직접 쓰거나, 오른쪽 화살표로 등록된 학생 목록에서 고르는 입력칸 */
export default function NameCombobox({
  id,
  value,
  onChange,
  names,
  maxLength,
  placeholder,
  className,
}: {
  id: string;
  value: string;
  onChange: (name: string) => void;
  names: string[];
  maxLength: number;
  placeholder?: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trimmed = value.trim();

  // 바깥을 누르면 목록 닫기
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(false)}
        className={`${className} ${names.length > 0 ? "pr-11" : ""}`}
      />
      {names.length > 0 && (
        <>
          <button
            type="button"
            aria-label="등록된 학생 보기"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
              <path d="M5 8l5 5 5-5" />
            </svg>
          </button>
          {open && (
            <ul role="listbox" aria-label="등록된 학생" className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {names.map((n) => (
                <li key={n} role="option" aria-selected={trimmed === n}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(n);
                      setOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-[15px] hover:bg-indigo-50 ${trimmed === n ? "font-semibold text-indigo-700" : "text-slate-700"}`}
                  >
                    {n}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
