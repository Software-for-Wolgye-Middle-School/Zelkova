import { DAYS, ROWS_PER_DAY, type DutyLog } from "@/lib/dutyLogSvg";

/**
 * 활동일지 저장: 고칠 때마다 먼저 이 브라우저(localStorage)에 저장하고, 이어서 서버에 저장함.
 * 서버가 꺼져 있거나 로그인이 풀려 서버 저장이 안 돼도 내용은 브라우저에 남아 있고(synced: false),
 * 연결이 돌아오면 다시 시도해 서버에 올림. 서버와 브라우저에 모두 있으면 수정 시각(updatedAt)이 나중인 쪽을 씀.
 */
export type DutyDoc = { log: DutyLog; updatedAt: number; /** 서버에도 같은 내용이 저장돼 있는지 */ synced: boolean };

const KEY = "zelkova:duty-log:v2";
const OLD_KEY = "zelkova:duty-log";

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

export function loadLocal(): DutyDoc | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<DutyDoc> | null;
    const log = parseLog(v?.log);
    if (log && typeof v?.updatedAt === "number") return { log, updatedAt: v.updatedAt, synced: !!v.synced };
    // 서버 저장이 생기기 전에 브라우저에만 저장해 둔 내용은 서버에 올려야 할 새 내용으로 봄
    const old = parseLog(JSON.parse(localStorage.getItem(OLD_KEY) ?? "null"));
    if (old) return { log: old, updatedAt: Date.now(), synced: false };
  } catch {
    // 저장된 내용이 없거나 막힌 브라우저
  }
  return null;
}

/** 고친 시각 (서버와 다른 컴퓨터의 내용 중 나중 것을 가리는 기준) */
export const editStamp = () => Date.now();

export function saveLocal(doc: DutyDoc) {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
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

/** 서버에 저장된 활동일지. doc 이 null 이면 아직 없음. 로그인이 풀렸으면 auth, 서버에 닿지 못하면 fail */
export async function fetchServer(): Promise<{ kind: "ok"; doc: ServerDoc | null } | { kind: "auth" | "fail" }> {
  try {
    const res = await fetch("/api/duty-log", { cache: "no-store" });
    if (res.status === 401) return { kind: "auth" };
    if (!res.ok) return { kind: "fail" };
    return { kind: "ok", doc: readDoc(((await res.json()) as { doc: unknown }).doc) };
  } catch {
    return { kind: "fail" };
  }
}

/** 서버에 저장. stale: 서버에 더 나중에 고친 내용이 있어 저장하지 않았고, 그 내용을 돌려줌 */
export async function pushServer(doc: ServerDoc, keepalive = false): Promise<{ kind: "ok" } | { kind: "stale"; doc: ServerDoc } | { kind: "auth" | "fail" }> {
  try {
    const res = await fetch("/api/duty-log", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
      keepalive, // 탭을 닫는 중에도 요청이 끝까지 가도록
    });
    if (res.status === 401) return { kind: "auth" };
    if (!res.ok) return { kind: "fail" };
    const data = (await res.json()) as { saved: boolean; doc: unknown };
    if (data.saved) return { kind: "ok" };
    const current = readDoc(data.doc);
    return current ? { kind: "stale", doc: current } : { kind: "fail" };
  } catch {
    return { kind: "fail" };
  }
}
