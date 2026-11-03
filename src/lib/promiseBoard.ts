/**
 * 나와의 약속판: 달력 계산과 파일 이름.
 */

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** promise: 하단 '이 달의 약속' 칸의 줄들 (직접 입력, 최대 PROMISE_MAX_LINES 줄) */
export type PromiseBoardRequest = { name: string; year: number; month: number; promise?: string[] };

export const PROMISE_MAX_LINES = 6;
export const PROMISE_LINE_CHARS = 24;

/** 입력한 글을 줄 수 · 줄 길이 제한에 맞게 다듬음 (A4 한 장을 넘지 않도록) */
export function clampPromise(text: string): string {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .slice(0, PROMISE_MAX_LINES)
    .map((l) => l.slice(0, PROMISE_LINE_CHARS))
    .join("\n");
}

/** 해당 월의 달력: 주마다 일~토 7칸, 날짜가 없는 칸은 null */
export function monthWeeks(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export function promiseBoardFileName({ name, year, month }: PromiseBoardRequest, ext = "jpg") {
  const safe = name.replace(/[\\/:*?"<>|]/g, "");
  return `${safe} 나와의 약속판 (${year}년 ${month}월).${ext}`;
}
