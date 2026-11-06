"use client";

import { useEffect, useRef, useState } from "react";

const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const MAX_SUGGESTIONS = 8;

/** 한글 음절을 초성 · 중성 · 종성 번호로 (한글 음절이 아니면 null) */
function syllable(ch: string) {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code >= 11172) return null;
  return { cho: Math.floor(code / 588), jung: Math.floor((code % 588) / 28), jong: code % 28 };
}

/**
 * 이름이 입력한 글자로 시작하는지. 초성만 써도 되고 (ㅇㅅㅅ → 이순신),
 * 마지막 글자는 아직 조합 중일 수 있어 받침 없는 글자도 앞부분으로 봄 (이수 → 이순신)
 */
function startsWithTyped(name: string, typed: string) {
  if (typed.length > name.length) return false;
  for (let i = 0; i < typed.length; i++) {
    const t = typed[i];
    const n = name[i];
    if (t === n) continue;
    const ns = syllable(n);
    if (!ns) return false;
    if (CHOSEONG.indexOf(t) === ns.cho) continue;
    const ts = syllable(t);
    if (i === typed.length - 1 && ts && ts.jong === 0 && ts.cho === ns.cho && ts.jung === ns.jung) continue;
    return false;
  }
  return true;
}

/** 입력한 글자로 시작하는 이름 먼저, 그다음 입력한 글자가 들어 있는 이름 */
function suggest(names: string[], typed: string) {
  const q = typed.trim();
  if (!q) return [];
  const starts = names.filter((n) => startsWithTyped(n, q));
  const contains = names.filter((n) => !starts.includes(n) && n.includes(q));
  return [...starts, ...contains].filter((n) => n !== q).slice(0, MAX_SUGGESTIONS);
}

/**
 * 이름을 쓰면 등록된 학생 이름을 자동완성으로 보여 주는 입력칸 (↑↓ 로 고르고 Enter).
 * onSubmit 을 주면 이름을 고르거나 목록 없이 Enter 를 눌렀을 때 그 이름으로 불림 (여러 명을 차례로 넣을 때)
 */
export default function NameCombobox({
  id,
  value,
  onChange,
  names,
  maxLength,
  placeholder,
  className,
  onSubmit,
}: {
  id: string;
  value: string;
  onChange: (name: string) => void;
  names: string[];
  maxLength: number;
  placeholder?: string;
  className: string;
  onSubmit?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const matches = open ? suggest(names, value) : [];
  const listId = `${id}-suggestions`;

  // 바깥을 누르면 목록 닫기
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (name: string) => {
    if (onSubmit) onSubmit(name);
    else onChange(name);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        autoComplete="off"
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-activedescendant={matches.length ? `${listId}-${Math.min(active, matches.length - 1)}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (!matches.length) {
            if (e.key === "Enter" && onSubmit) {
              e.preventDefault();
              onSubmit(value);
            }
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[Math.min(active, matches.length - 1)]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={className}
      />
      {matches.length > 0 && (
        <ul id={listId} role="listbox" aria-label="등록된 학생" className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((n, i) => (
            <li key={n} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()} // 입력칸에서 포커스가 빠지지 않게
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(n)}
                className={`block w-full px-3 py-2 text-left text-[15px] ${i === active ? "bg-indigo-50 text-indigo-700" : "text-slate-700"}`}
              >
                {n}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
