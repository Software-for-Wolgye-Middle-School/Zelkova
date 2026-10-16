/**
 * 나와의 약속판: 달력 계산과 파일 이름.
 */

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type PromiseBoardRequest = { name: string; year: number; month: number };

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
