/** 활동일지 달력에 등록하는 일정 (브라우저와 서버가 같이 씀) */
export type DutyEvent = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** HH:MM (종일이면 빈칸) */
  time: string;
  memo: string;
};

export const EVENT_TITLE_MAX = 40;
export const EVENT_MEMO_MAX = 200;

const isIso = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

/** 올바른 모양의 일정만 받아 길이를 맞춤. 아니면 null */
export function sanitizeEvent(input: unknown): DutyEvent | null {
  const v = input as Partial<DutyEvent> | null;
  if (!v || typeof v.id !== "string" || !/^[\w-]{1,40}$/.test(v.id) || !isIso(v.date)) return null;
  const title = String(v.title ?? "").trim().slice(0, EVENT_TITLE_MAX);
  const time = typeof v.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) ? v.time : "";
  if (!title) return null;
  return { id: v.id, date: v.date, title, time, memo: String(v.memo ?? "").slice(0, EVENT_MEMO_MAX) };
}

/** 같은 날의 일정 순서: 시간이 있는 것은 시간순, 종일 일정이 먼저 */
export const byTime = (a: DutyEvent, b: DutyEvent) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title, "ko");
