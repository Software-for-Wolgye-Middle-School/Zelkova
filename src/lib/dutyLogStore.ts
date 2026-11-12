import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalWeeks, DAYS, mondayOf, NOTE_MAX, ROWS_PER_DAY, type DutyLog } from "@/lib/dutyLogSvg";
import { sanitizeEvent, type DutyEvent } from "@/lib/dutyEvents";

/**
 * 특수교육실무사 활동일지와 달력 일정을 서버에 저장하는 작은 저장소 (서버 전용). 학생 정보(studentStore)와 같은 방식:
 * Upstash Redis 환경 변수가 있으면 거기에, 없으면 서버 디스크(STUDENTS_DATA_DIR, 기본값은 프로젝트의 data 폴더)의 파일 하나에 저장함.
 * 활동일지는 한 주(월요일 날짜가 열쇠)에 한 장씩, 일정은 일정마다(id가 열쇠) 모두 한 덩어리로 보관함.
 * 브라우저가 보낸 수정 시각(updatedAt)이 서버에 있는 것보다 오래됐으면 그 항목은 덮어쓰지 않고 서버 것을 돌려줌 (나중에 고친 쪽이 이김).
 * 지운 일정은 event: null 로 남겨 두어, 다른 컴퓨터에 남아 있던 같은 일정이 되살아나지 않게 함.
 */

export type StoredDutyLog = { updatedAt: number; log: DutyLog };
export type DutyWeeks = Record<string, StoredDutyLog>;
export type StoredEvent = { updatedAt: number; event: DutyEvent | null };
export type DutyEvents = Record<string, StoredEvent>;
type Doc = { weeks: DutyWeeks; events: DutyEvents };

const FILE = path.join(process.env.STUDENTS_DATA_DIR ?? path.join(process.cwd(), "data"), "dutylog.json");
const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = "zelkova:dutylog";
const MAX_WEEKS = 600;
const MAX_EVENTS = 5000;

async function redis(command: string[]): Promise<unknown> {
  const res = await fetch(REDIS_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `Redis ${res.status}`);
  return data.result;
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^(\d{4}-\d{2}-\d{2})?$/.test(v);
export const isWeekKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** 올바른 모양의 활동일지만 받아 길이를 맞춤. 아니면 null */
export function sanitizeDutyLog(input: unknown): DutyLog | null {
  const v = input as Partial<DutyLog> | null;
  if (!v || !isDate(v.start) || !isDate(v.end) || !Array.isArray(v.checks) || !Array.isArray(v.notes)) return null;
  if (v.checks.length !== DAYS.length * ROWS_PER_DAY || v.notes.length !== DAYS.length) return null;
  return {
    start: v.start,
    end: v.end,
    checks: v.checks.map(Boolean),
    notes: v.notes.map((n) => String(n ?? "").slice(0, NOTE_MAX)),
    signed: !!v.signed,
  };
}

const readWeek = (v: unknown): StoredDutyLog | null => {
  const d = v as { updatedAt?: unknown; log?: unknown } | null;
  const log = sanitizeDutyLog(d?.log);
  return log && typeof d?.updatedAt === "number" ? { updatedAt: d.updatedAt, log } : null;
};

/** 지운 일정(event: null)도 받음. 모양이 틀린 일정은 null 로 */
const readEvent = (id: string, v: unknown): StoredEvent | null => {
  const d = v as { updatedAt?: unknown; event?: unknown } | null;
  if (typeof d?.updatedAt !== "number") return null;
  if (d.event === null) return { updatedAt: d.updatedAt, event: null };
  const event = sanitizeEvent(d.event);
  return event && event.id === id ? { updatedAt: d.updatedAt, event } : null;
};

/** 저장된 모든 내용. 아직 아무것도 저장하지 않았으면 빈 내용이고, 읽다가 실패하면 오류를 던짐 (저장할 때 다른 기록을 지우지 않도록) */
async function readAll(): Promise<Doc> {
  let raw: unknown;
  try {
    raw = REDIS_URL && REDIS_TOKEN ? await redis(["GET", REDIS_KEY]) : await readFile(FILE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { weeks: {}, events: {} };
    throw e;
  }
  const doc: Doc = { weeks: {}, events: {} };
  if (typeof raw !== "string") return doc;
  const data = JSON.parse(raw) as { weeks?: Record<string, unknown>; events?: Record<string, unknown>; updatedAt?: unknown; log?: unknown };
  for (const [key, value] of Object.entries(data.weeks ?? {})) {
    const week = readWeek(value);
    if (isWeekKey(key) && week) doc.weeks[key] = week;
  }
  for (const [id, value] of Object.entries(data.events ?? {})) {
    const ev = readEvent(id, value);
    if (ev) doc.events[id] = ev;
  }
  // 주별로 나누기 전에 한 장만 저장하던 때의 내용: 시작일이 있는 주로 옮김
  const legacy = readWeek(data);
  if (legacy && isWeekKey(legacy.log.start) && !doc.weeks[mondayOf(legacy.log.start)]) doc.weeks[mondayOf(legacy.log.start)] = legacy;
  doc.weeks = canonicalWeeks(doc.weeks); // 월요일이 아닌 날짜가 열쇠인 기록은 그 주 월요일 기록으로 합침
  return doc;
}

/** 화면에 보여 줄 때는 읽지 못하면 빈 내용으로 */
export async function readDutyDoc(): Promise<Doc> {
  try {
    return await readAll();
  } catch (e) {
    console.error(e);
    return { weeks: {}, events: {} };
  }
}

async function persist(doc: Doc) {
  const body = JSON.stringify(doc);
  if (REDIS_URL && REDIS_TOKEN) {
    await redis(["SET", REDIS_KEY, body]);
    return;
  }
  await mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, FILE);
}

let queue: Promise<unknown> = Promise.resolve();
/** 저장 요청은 차례대로 처리 (읽고 → 바꾸고 → 쓰는 사이에 다른 요청이 끼어들지 않도록). 한 번 실패해도 다음 저장은 계속 처리 */
function serial<T>(job: () => Promise<T>): Promise<T> {
  const result = queue.then(job);
  queue = result.catch(() => {});
  return result;
}

/** 한 주의 활동일지를 저장하고 서버에 남은 그 주 내용을 돌려줌. 서버에 더 새로운 것이 있으면 저장하지 않고 그것을 돌려줌 (saved: false) */
export function writeDutyWeek(key: string, updatedAt: number, input: unknown): Promise<{ saved: boolean; current: StoredDutyLog }> {
  const log = sanitizeDutyLog(input);
  if (!isWeekKey(key) || !log) return Promise.reject(new Error("잘못된 활동일지"));
  return serial(async () => {
    const doc = await readAll();
    const existing = doc.weeks[key];
    if (existing && existing.updatedAt > updatedAt) return { saved: false, current: existing };
    if (!existing && Object.keys(doc.weeks).length >= MAX_WEEKS) throw new Error("저장할 수 있는 주 수를 넘었어요.");
    const week = { updatedAt, log };
    await persist({ ...doc, weeks: { ...doc.weeks, [key]: week } });
    return { saved: true, current: week };
  });
}

/** 일정 하나를 저장(또는 event 가 null 이면 지움 표시). 서버에 더 새로운 것이 있으면 저장하지 않고 그것을 돌려줌 (saved: false) */
export function writeDutyEvent(id: string, updatedAt: number, input: unknown): Promise<{ saved: boolean; current: StoredEvent }> {
  const event = input === null ? null : sanitizeEvent(input);
  if (!/^[\w-]{1,40}$/.test(id) || (input !== null && (!event || event.id !== id))) return Promise.reject(new Error("잘못된 일정"));
  return serial(async () => {
    const doc = await readAll();
    const existing = doc.events[id];
    if (existing && existing.updatedAt > updatedAt) return { saved: false, current: existing };
    if (!existing && Object.keys(doc.events).length >= MAX_EVENTS) throw new Error("저장할 수 있는 일정 수를 넘었어요.");
    const stored = { updatedAt, event };
    await persist({ ...doc, events: { ...doc.events, [id]: stored } });
    return { saved: true, current: stored };
  });
}
