import { DAYS, mondayOf, ROWS_PER_DAY, type DutyLog } from "@/lib/dutyLogSvg";
import { sanitizeEvent, type DutyEvent } from "@/lib/dutyEvents";

/**
 * 활동일지 저장: 활동일지는 주마다 한 장씩(그 주 월요일 날짜가 열쇠) 기록함.
 * 고칠 때마다 먼저 이 브라우저(localStorage)에 저장하고, 이어서 서버에 저장함.
 * 서버가 꺼져 있거나 로그인이 풀려 서버 저장이 안 돼도 내용은 브라우저에 남아 있고(synced: false),
 * 연결이 돌아오면 다시 시도해 서버에 올림. 서버와 브라우저에 모두 있으면 수정 시각(updatedAt)이 나중인 쪽을 씀.
 */
export type DutyDoc = { log: DutyLog; updatedAt: number; /** 서버에도 같은 내용이 저장돼 있는지 */ synced: boolean };
/** 주(월요일 날짜) → 그 주의 활동일지 */
export type DutyDocs = Record<string, DutyDoc>;

const KEY = "zelkova:duty-log:v3";
/** 주별로 나누기 전에 한 장만 저장하던 때의 값 */
const V2_KEY = "zelkova:duty-log:v2";
const V1_KEY = "zelkova:duty-log";

const isWeekKey = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);

/** 모양이 맞는 활동일지만 받음 (아니면 null) */
export function parseLog(v: unknown): DutyLog | null {
  const d = v as Partial<DutyLog> | null;
  if (
    d &&
    typeof d.start === "string" &&
    typeof d.end === "string" &&
    Array.isArray(d.checks) &&
    d.checks.length === DAYS.length * ROWS_PER_DAY &&
    Array.isArray(d.notes) &&
    d.notes.length === DAYS.length
  ) {
    return { start: d.start, end: d.end, checks: d.checks.map(Boolean), notes: d.notes.map(String), signed: !!d.signed };
  }
  return null;
}

/** 이 컴퓨터에 저장된 모든 주 */
export function loadLocal(): DutyDocs {
  const out: DutyDocs = {};
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Record<string, Partial<DutyDoc>> | null;
    for (const [key, d] of Object.entries(v ?? {})) {
      const log = parseLog(d?.log);
      if (isWeekKey(key) && log && typeof d?.updatedAt === "number") out[key] = { log, updatedAt: d.updatedAt, synced: !!d.synced };
    }
    // 예전에 한 장만 저장해 둔 내용은 시작일이 속한 주로 옮기고, 서버에 올려야 할 새 내용으로 봄
    for (const old of [V2_KEY, V1_KEY]) {
      const raw = JSON.parse(localStorage.getItem(old) ?? "null") as { log?: unknown } | null;
      const log = parseLog(old === V2_KEY ? raw?.log : raw);
      if (log && /^\d{4}-\d{2}-\d{2}$/.test(log.start)) {
        const key = mondayOf(log.start);
        if (!out[key]) out[key] = { log, updatedAt: editStamp(), synced: false };
      }
    }
  } catch {
    // 저장된 내용이 없거나 막힌 브라우저
  }
  return out;
}

/** 고친 시각 (서버와 다른 컴퓨터의 내용 중 나중 것을 가리는 기준) */
export const editStamp = () => Date.now();

export function saveLocal(docs: DutyDocs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(docs));
  } catch {
    // 저장 공간이 없거나 막힌 브라우저: 서버 저장에 맡김
  }
}

export type ServerDoc = { log: DutyLog; updatedAt: number };

const readDoc = (v: unknown): ServerDoc | null => {
  const d = v as { updatedAt?: unknown; log?: unknown } | null;
  const log = parseLog(d?.log);
  return log && typeof d?.updatedAt === "number" ? { log, updatedAt: d.updatedAt } : null;
};

// ---------------------------------------------------------------- 달력 일정 (event: null 은 지운 일정)
export type EventDoc = { event: DutyEvent | null; updatedAt: number; synced: boolean };
export type EventDocs = Record<string, EventDoc>;
export type ServerEvent = { event: DutyEvent | null; updatedAt: number };

const EVENTS_KEY = "zelkova:duty-events:v1";

/** 이 컴퓨터에 저장된 모든 일정 */
export function loadLocalEvents(): EventDocs {
  const out: EventDocs = {};
  try {
    const v = JSON.parse(localStorage.getItem(EVENTS_KEY) ?? "null") as Record<string, Partial<EventDoc>> | null;
    for (const [id, d] of Object.entries(v ?? {})) {
      if (typeof d?.updatedAt !== "number") continue;
      const event = d.event === null ? null : sanitizeEvent(d.event);
      if (d.event === null || (event && event.id === id)) out[id] = { event, updatedAt: d.updatedAt, synced: !!d.synced };
    }
  } catch {
    // 저장된 내용이 없거나 막힌 브라우저
  }
  return out;
}

export function saveLocalEvents(docs: EventDocs) {
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(docs));
  } catch {
    // 저장 공간이 없거나 막힌 브라우저: 서버 저장에 맡김
  }
}

const readEventDoc = (id: string, v: unknown): ServerEvent | null => {
  const d = v as { updatedAt?: unknown; event?: unknown } | null;
  if (typeof d?.updatedAt !== "number") return null;
  if (d.event === null) return { event: null, updatedAt: d.updatedAt };
  const event = sanitizeEvent(d.event);
  return event && event.id === id ? { event, updatedAt: d.updatedAt } : null;
};

/** 서버에 저장된 모든 활동일지(주별)와 일정. 로그인이 풀렸으면 auth, 서버에 닿지 못하면 fail */
export async function fetchServer(): Promise<{ kind: "ok"; weeks: Record<string, ServerDoc>; events: Record<string, ServerEvent> } | { kind: "auth" | "fail" }> {
  try {
    const res = await fetch("/api/duty-log", { cache: "no-store" });
    if (res.status === 401) return { kind: "auth" };
    if (!res.ok) return { kind: "fail" };
    const data = (await res.json()) as { weeks?: Record<string, unknown>; events?: Record<string, unknown> };
    const weeks: Record<string, ServerDoc> = {};
    for (const [key, value] of Object.entries(data.weeks ?? {})) {
      const doc = readDoc(value);
      if (isWeekKey(key) && doc) weeks[key] = doc;
    }
    const events: Record<string, ServerEvent> = {};
    for (const [id, value] of Object.entries(data.events ?? {})) {
      const doc = readEventDoc(id, value);
      if (doc) events[id] = doc;
    }
    return { kind: "ok", weeks, events };
  } catch {
    return { kind: "fail" };
  }
}

/** PUT 요청. stale: 서버에 더 나중에 고친 내용이 있어 저장하지 않았고, 그 내용을 돌려줌 */
async function put(url: string, body: unknown, keepalive: boolean): Promise<{ kind: "ok" } | { kind: "stale"; doc: unknown } | { kind: "auth" | "fail" }> {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive, // 탭을 닫는 중에도 요청이 끝까지 가도록
    });
    if (res.status === 401) return { kind: "auth" };
    if (!res.ok) return { kind: "fail" };
    const data = (await res.json()) as { saved: boolean; doc: unknown };
    return data.saved ? { kind: "ok" } : { kind: "stale", doc: data.doc };
  } catch {
    return { kind: "fail" };
  }
}

/** 한 주의 활동일지를 서버에 저장 */
export async function pushServer(key: string, doc: ServerDoc, keepalive = false): Promise<{ kind: "ok" } | { kind: "stale"; doc: ServerDoc } | { kind: "auth" | "fail" }> {
  const r = await put("/api/duty-log", { key, ...doc }, keepalive);
  if (r.kind !== "stale") return r;
  const current = readDoc(r.doc);
  return current ? { kind: "stale", doc: current } : { kind: "fail" };
}

/** 일정 하나를 서버에 저장 (event 가 null 이면 지운 일정) */
export async function pushEvent(id: string, doc: ServerEvent, keepalive = false): Promise<{ kind: "ok" } | { kind: "stale"; doc: ServerEvent } | { kind: "auth" | "fail" }> {
  const r = await put("/api/duty-log/events", { id, ...doc }, keepalive);
  if (r.kind !== "stale") return r;
  const current = readEventDoc(id, r.doc);
  return current ? { kind: "stale", doc: current } : { kind: "fail" };
}

/** 새 일정의 id (일정마다 다르고, 서버가 받는 글자만 씀) */
export const newEventId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
