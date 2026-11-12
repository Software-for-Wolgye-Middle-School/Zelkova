import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DAYS, NOTE_MAX, ROWS_PER_DAY, type DutyLog } from "@/lib/dutyLogSvg";

/**
 * 특수교육실무사 활동일지를 서버에 저장하는 작은 저장소 (서버 전용). 학생 정보(studentStore)와 같은 방식:
 * Upstash Redis 환경 변수가 있으면 거기에, 없으면 서버 디스크(STUDENTS_DATA_DIR, 기본값은 프로젝트의 data 폴더)의 파일 하나에 저장함.
 * 브라우저가 보낸 수정 시각(updatedAt)이 서버에 있는 것보다 오래됐으면 덮어쓰지 않고 서버 것을 돌려줌 (나중에 고친 쪽이 이김).
 */

export type StoredDutyLog = { updatedAt: number; log: DutyLog };

const FILE = path.join(process.env.STUDENTS_DATA_DIR ?? path.join(process.cwd(), "data"), "dutylog.json");
const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = "zelkova:dutylog";

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

export async function readDutyLog(): Promise<StoredDutyLog | null> {
  try {
    const raw = REDIS_URL && REDIS_TOKEN ? await redis(["GET", REDIS_KEY]) : await readFile(FILE, "utf8");
    if (typeof raw !== "string") return null;
    const data = JSON.parse(raw) as { updatedAt?: unknown; log?: unknown };
    const log = sanitizeDutyLog(data.log);
    return log && typeof data.updatedAt === "number" ? { updatedAt: data.updatedAt, log } : null;
  } catch {
    return null; // 파일이 아직 없거나 깨진 경우
  }
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * 저장하고 서버에 남은 것을 돌려줌. 서버에 더 새로운 것이 있으면 저장하지 않고 그것을 돌려줌 (saved: false)
 */
export function writeDutyLog(updatedAt: number, input: unknown): Promise<{ saved: boolean; current: StoredDutyLog }> {
  const log = sanitizeDutyLog(input);
  if (!log) return Promise.reject(new Error("잘못된 활동일지"));
  const job = queue.then(async () => {
    const existing = await readDutyLog();
    if (existing && existing.updatedAt > updatedAt) return { saved: false, current: existing };
    const doc = { updatedAt, log };
    if (REDIS_URL && REDIS_TOKEN) {
      await redis(["SET", REDIS_KEY, JSON.stringify(doc)]);
    } else {
      await mkdir(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(doc, null, 2), "utf8");
      await rename(tmp, FILE);
    }
    return { saved: true, current: doc };
  });
  queue = job.catch(() => {}); // 한 번 실패해도 다음 저장은 계속 처리
  return job;
}
