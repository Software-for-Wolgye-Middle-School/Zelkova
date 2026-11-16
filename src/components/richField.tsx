"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";

/**
 * 글 일부에만 글꼴 · 글자 크기 · 굵게를 주는 칸 (한글 편집기처럼 고른 영역에만 반영).
 * 칸의 글은 그대로 한 덩어리 글(예전과 같은 저장 칸)이고, 글자 모양이 다른 구간은 따로 rt.<칸 이름> 칸에 [시작, 끝, 모양] 목록으로 저장함.
 * 구간이 하나도 없는 칸은 예전처럼 글 상자(textarea)로 그려 짐: 이 칸은 글자 모양이 달라진 칸에서만 쓰임.
 */

export type RunFmt = { f?: string; z?: number; b?: boolean };
export type Run = [number, number, RunFmt];

export const rtKey = (field: string) => `rt.${field}`;

const cleanFmt = (x: Partial<RunFmt> | null | undefined): RunFmt => {
  const o: RunFmt = {};
  if (x && typeof x.f === "string" && x.f) o.f = x.f;
  if (x && typeof x.z === "number" && x.z >= 5 && x.z <= 72) o.z = Math.round(x.z * 10) / 10;
  if (x && typeof x.b === "boolean") o.b = x.b;
  return o;
};
const isEmpty = (x: RunFmt) => x.f === undefined && x.z === undefined && x.b === undefined;
const same = (a: RunFmt, b: RunFmt) => a.f === b.f && a.z === b.z && a.b === b.b;

/** 저장된 구간 목록 (글 길이 안으로 맞추고, 겹치지 않게 순서대로) */
export function parseRuns(raw: string | undefined, len: number): Run[] {
  if (!raw) return [];
  try {
    const o = JSON.parse(raw) as { r?: unknown };
    if (!Array.isArray(o.r)) return [];
    const chars: RunFmt[] = Array.from({ length: len }, () => ({}));
    for (const item of o.r) {
      if (!Array.isArray(item) || typeof item[0] !== "number" || typeof item[1] !== "number") continue;
      const fmt = cleanFmt(item[2] as Partial<RunFmt>);
      for (let i = Math.max(0, item[0]); i < Math.min(len, item[1]); i++) chars[i] = { ...chars[i], ...fmt };
    }
    return fromChars(chars);
  } catch {
    return [];
  }
}

export const stringifyRuns = (runs: Run[]) => (runs.length ? JSON.stringify({ r: runs }) : "");

/** 글자마다의 모양 */
export function toChars(runs: Run[], len: number): RunFmt[] {
  const chars: RunFmt[] = Array.from({ length: len }, () => ({}));
  for (const [s, e, f] of runs) for (let i = Math.max(0, s); i < Math.min(len, e); i++) chars[i] = f;
  return chars;
}

/** 글자마다의 모양 → 이어지는 같은 모양을 한 구간으로 (모양이 없는 글자는 구간이 없음) */
export function fromChars(chars: RunFmt[]): Run[] {
  const out: Run[] = [];
  let i = 0;
  while (i < chars.length) {
    if (isEmpty(chars[i])) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < chars.length && same(chars[j], chars[i])) j++;
    out.push([i, j, chars[i]]);
    i = j;
  }
  return out;
}

/** 고른 영역 [a, b) 에만 모양(patch)을 줌. patch 에 없는 항목은 그대로 */
export function applyFmt(runs: Run[], len: number, a: number, b: number, patch: Partial<RunFmt>): Run[] {
  const chars = toChars(runs, len);
  const given: Partial<RunFmt> = {};
  if (patch.f !== undefined) given.f = patch.f;
  if (patch.z !== undefined) given.z = patch.z;
  if (patch.b !== undefined) given.b = patch.b;
  for (let i = Math.max(0, a); i < Math.min(len, b); i++) chars[i] = cleanFmt({ ...chars[i], ...given });
  return fromChars(chars);
}

/** 글이 바뀐 만큼 구간을 옮김: 앞뒤 같은 글은 그대로, 새로 들어간 글은 바로 앞 글자의 모양을 따름 */
export function remapRuns(oldText: string, newText: string, runs: Run[]): Run[] {
  if (oldText === newText) return runs;
  let p = 0;
  while (p < oldText.length && p < newText.length && oldText[p] === newText[p]) p++;
  let s = 0;
  while (s < oldText.length - p && s < newText.length - p && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
  const old = toChars(runs, oldText.length);
  const inserted = Array.from({ length: newText.length - p - s }, () => (p > 0 ? old[p - 1] : {}));
  return fromChars([...old.slice(0, p), ...inserted, ...old.slice(oldText.length - s)]);
}

// ---------------------------------------------------------------- 화면 (contenteditable)

/** 문단(맨 위 자식)마다의 글 조각들 */
const paraNodes = (el: HTMLElement) => [...el.childNodes];

function fmtOfNode(node: Node, root: HTMLElement): RunFmt {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n instanceof HTMLElement && (n.dataset.f !== undefined || n.dataset.z !== undefined || n.dataset.b !== undefined)) {
      return cleanFmt({ f: n.dataset.f, z: n.dataset.z ? Number(n.dataset.z) : undefined, b: n.dataset.b === undefined ? undefined : n.dataset.b === "1" });
    }
    n = n.parentNode;
  }
  return {};
}

/** 화면에 그려진 글과 글자마다의 모양 (문단은 줄 바꿈 글자로) */
export function readRich(root: HTMLElement): { text: string; chars: RunFmt[] } {
  let text = "";
  const chars: RunFmt[] = [];
  paraNodes(root).forEach((para, i) => {
    if (i > 0) {
      text += "\n";
      chars.push({});
    }
    const walk = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = (n.textContent ?? "").replace(/​/g, "");
        const f = fmtOfNode(n, root);
        text += t;
        for (let k = 0; k < t.length; k++) chars.push(f);
      } else n.childNodes.forEach(walk);
    };
    walk(para);
  });
  return { text, chars };
}

/** 글 위치(글자 번호)에 해당하는 화면의 자리 */
function locate(root: HTMLElement, pos: number): [Node, number] {
  let idx = 0;
  const paras = paraNodes(root);
  for (let pi = 0; pi < paras.length; pi++) {
    const texts: Text[] = [];
    const walk = (n: Node) => (n.nodeType === Node.TEXT_NODE ? texts.push(n as Text) : n.childNodes.forEach(walk));
    walk(paras[pi]);
    const len = texts.reduce((n, t) => n + t.length, 0);
    if (pos <= idx + len) {
      let at = idx;
      for (const t of texts) {
        if (pos <= at + t.length) return [t, pos - at];
        at += t.length;
      }
      return [paras[pi], 0];
    }
    idx += len + 1;
  }
  return [root, root.childNodes.length];
}

/** 화면에서 고른 영역의 글 위치 [시작, 끝] (이 칸 안이 아니면 null) */
export function richSelection(root: HTMLElement): [number, number] | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const at = (node: Node, off: number) => {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, off);
    const tmp = document.createElement("div");
    tmp.appendChild(range.cloneContents());
    return readRich(tmp).text.length;
  };
  return [at(r.startContainer, r.startOffset), at(r.endContainer, r.endOffset)];
}

export function setRichSelection(root: HTMLElement, a: number, b: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const [n1, o1] = locate(root, a);
  const [n2, o2] = locate(root, b);
  const range = document.createRange();
  range.setStart(n1, o1);
  range.setEnd(n2, o2);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 글 상자 · 글 칸 어느 쪽이든 고른 영역 */
export function getSel(el: Element | null): [number, number] | null {
  if (el instanceof HTMLTextAreaElement) return [el.selectionStart, el.selectionEnd];
  if (el instanceof HTMLElement && el.dataset.rich) return richSelection(el);
  return null;
}
export function setSel(el: Element | null, a: number, b: number) {
  if (el instanceof HTMLTextAreaElement) el.setSelectionRange(a, b);
  else if (el instanceof HTMLElement && el.dataset.rich) setRichSelection(el, a, b);
}

/** 모양을 준 뒤 칸이 글 상자 ↔ 글 칸으로 바뀌어 다시 그려져도 고른 영역을 되살리기 위해 적어 둠 */
const pendingSel = { field: "", a: 0, b: 0 };
export function rememberSel(field: string, a: number, b: number) {
  pendingSel.field = field;
  pendingSel.a = a;
  pendingSel.b = b;
}
/** 새로 그려진 칸이 적어 둔 영역의 칸이면 그 자리에 커서를 둠 */
export function restorePending(el: HTMLElement, field: string) {
  if (pendingSel.field !== field) return;
  const { a, b } = pendingSel;
  pendingSel.field = "";
  el.focus({ preventScroll: true });
  setSel(el, a, b);
}

function paint(root: HTMLElement, text: string, runs: Run[], css: (f: RunFmt) => CSSProperties) {
  const chars = toChars(runs, text.length);
  root.textContent = "";
  let pos = 0;
  for (const line of text.split("\n")) {
    const div = document.createElement("div");
    if (!line) div.appendChild(document.createElement("br"));
    else {
      let i = 0;
      while (i < line.length) {
        let j = i + 1;
        while (j < line.length && same(chars[pos + j], chars[pos + i])) j++;
        const f = chars[pos + i];
        const span = document.createElement("span");
        if (f.f !== undefined) span.dataset.f = f.f;
        if (f.z !== undefined) span.dataset.z = String(f.z);
        if (f.b !== undefined) span.dataset.b = f.b ? "1" : "0";
        Object.assign(span.style, css(f));
        span.textContent = line.slice(i, j);
        div.appendChild(span);
        i = j;
      }
    }
    root.appendChild(div);
    pos += line.length + 1;
  }
}

export function RichField({
  k,
  value,
  runs,
  css,
  className = "",
  style,
  single = false,
  max,
  onEdit,
  onFocus,
  onBlur,
  onCompose,
  onSelect,
  onHotkey,
  shadow,
}: {
  k: string;
  value: string;
  runs: Run[];
  /** 구간의 모양 → 화면 글자 모양 */
  css: (f: RunFmt) => CSSProperties;
  className?: string;
  style?: CSSProperties;
  single?: boolean;
  max: number;
  onEdit: (text: string, runs: Run[]) => void;
  onFocus: () => void;
  onBlur: () => void;
  onCompose: (on: boolean) => void;
  onSelect: () => void;
  /** Ctrl+B 같은 단축키: 처리했으면 true */
  onHotkey: (e: React.KeyboardEvent) => boolean;
  shadow?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const sig = JSON.stringify(runs);

  // 저장된 글 · 모양과 화면이 다르면(다른 선생님이 고쳤거나 되돌리기) 다시 그림
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || composing.current) return;
    const cur = readRich(el);
    if (cur.text === value && JSON.stringify(fromChars(cur.chars)) === sig) {
      restorePending(el, k);
      return;
    }
    const focused = document.activeElement === el ? richSelection(el) : null;
    paint(el, value, runs, css);
    if (focused) setRichSelection(el, Math.min(focused[0], value.length), Math.min(focused[1], value.length));
    restorePending(el, k);
  }, [value, sig, css, k, runs]);

  const edit = () => {
    const el = ref.current;
    if (!el) return;
    const { text, chars } = readRich(el);
    if (text.length > max) return;
    onEdit(text, fromChars(chars));
  };

  return (
    <div
      ref={ref}
      data-field={k}
      data-rich="1"
      role="textbox"
      aria-multiline={!single}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={edit}
      onFocus={onFocus}
      onBlur={onBlur}
      onSelect={onSelect}
      onKeyUp={onSelect}
      onMouseUp={onSelect}
      onCompositionStart={() => {
        composing.current = true;
        onCompose(true);
      }}
      onCompositionEnd={() => {
        composing.current = false;
        onCompose(false);
        edit();
      }}
      onPaste={(e) => {
        // 붙여넣기는 글자만
        e.preventDefault();
        const t = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
        document.execCommand("insertText", false, single ? t.replace(/\n/g, " ") : t);
      }}
      onKeyDown={(e) => {
        if (onHotkey(e)) return;
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (single) return;
        // 줄 바꿈: 앞 글자의 모양을 이어 받음
        const el = ref.current;
        const sel = el && richSelection(el);
        if (!el || !sel) return;
        const { text, chars } = readRich(el);
        const [a, b] = sel;
        if (text.length - (b - a) + 1 > max) return;
        const nextText = `${text.slice(0, a)}\n${text.slice(b)}`;
        const nextChars = [...chars.slice(0, a), chars[a - 1] ?? {}, ...chars.slice(b)];
        paint(el, nextText, fromChars(nextChars), css);
        setRichSelection(el, a + 1, a + 1);
        onEdit(nextText, fromChars(nextChars));
      }}
      className={`whitespace-pre-wrap break-words outline-none ${className}`}
      style={{ ...style, ...(shadow ? { boxShadow: `inset 0 0 0 2px ${shadow}` } : {}) }}
    />
  );
}
