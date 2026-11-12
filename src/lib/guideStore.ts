import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 사회복무요원 업무 안내(인수인계) 글을 저장하는 곳 (서버 전용).
 * 학생 이름 · 특성이 들어가는 글이라 코드(GitHub)에 넣지 않고, 학생 정보와 같은 저장소에 둠:
 * Upstash Redis 환경 변수가 있으면 거기에, 없으면 서버 디스크(STUDENTS_DATA_DIR, 기본값은 data 폴더)의 파일에 저장함.
 */

export type Guide = { text: string; updatedAt: number | null };

export const GUIDE_MAX = 20000;

const FILE = path.join(process.env.STUDENTS_DATA_DIR ?? path.join(process.cwd(), "data"), "guide.json");
const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = "zelkova:guide";

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

export async function readGuide(): Promise<Guide> {
  try {
    const raw = REDIS_URL && REDIS_TOKEN ? await redis(["GET", REDIS_KEY]) : await readFile(FILE, "utf8");
    if (typeof raw !== "string") return { text: "", updatedAt: null };
    const data = JSON.parse(raw) as Partial<Guide>;
    return { text: typeof data.text === "string" ? data.text : "", updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : null };
  } catch {
    return { text: "", updatedAt: null }; // 아직 저장한 적이 없거나 깨진 경우
  }
}

/** 업무 안내 글을 통째로 바꿔 저장하고, 저장된 글을 돌려줌 */
export async function writeGuide(input: unknown): Promise<Guide> {
  const guide: Guide = { text: typeof input === "string" ? input.slice(0, GUIDE_MAX).trim() : "", updatedAt: Date.now() };
  const body = JSON.stringify(guide);
  if (REDIS_URL && REDIS_TOKEN) {
    await redis(["SET", REDIS_KEY, body]);
    return guide;
  }
  await mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, FILE);
  return guide;
}
