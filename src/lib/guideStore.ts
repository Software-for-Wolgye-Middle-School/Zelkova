import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 사회복무요원 업무 안내(인수인계) 글을 저장하는 곳 (서버 전용).
 * 학생 이름 · 특성이 들어가는 글이라 코드(GitHub)에 넣지 않고, 학생 정보와 같은 저장소에 둠:
 * Upstash Redis 환경 변수가 있으면 거기에, 없으면 서버 디스크(STUDENTS_DATA_DIR, 기본값은 data 폴더)의 파일에 저장함.
 */

/** text: 업무 안내(인수인계) · students: 학생 소개 (성격 · 좋아하는 것 등, 챗봇이 학생에 대해 답할 때 씀) */
export type Guide = { text: string; students: string; updatedAt: number | null };

export const GUIDE_MAX = 20000;
export const STUDENTS_INTRO_MAX = 10000;

const DIR = process.env.STUDENTS_DATA_DIR ?? path.join(process.cwd(), "data");
const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

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

/** 이름(name)으로 JSON 한 덩어리를 읽음. Redis 키는 zelkova:<name>, 파일은 data/<name>.json */
async function readJson(name: string): Promise<unknown> {
  try {
    const raw = REDIS_URL && REDIS_TOKEN ? await redis(["GET", `zelkova:${name}`]) : await readFile(path.join(DIR, `${name}.json`), "utf8");
    return typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    return null; // 아직 저장한 적이 없거나 깨진 경우
  }
}

async function writeJson(name: string, value: unknown) {
  const body = JSON.stringify(value);
  if (REDIS_URL && REDIS_TOKEN) {
    await redis(["SET", `zelkova:${name}`, body]);
    return;
  }
  const file = path.join(DIR, `${name}.json`);
  await mkdir(DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, file);
}

export async function readGuide(): Promise<Guide> {
  const data = (await readJson("guide")) as Partial<Guide> | null;
  return {
    text: typeof data?.text === "string" ? data.text : "",
    students: typeof data?.students === "string" ? data.students : "",
    updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : null,
  };
}

/** 업무 안내 글과 학생 소개를 통째로 바꿔 저장하고, 저장된 글을 돌려줌 */
export async function writeGuide(text: unknown, students: unknown): Promise<Guide> {
  const guide: Guide = {
    text: typeof text === "string" ? text.slice(0, GUIDE_MAX).trim() : "",
    students: typeof students === "string" ? students.slice(0, STUDENTS_INTRO_MAX).trim() : "",
    updatedAt: Date.now(),
  };
  await writeJson("guide", guide);
  return guide;
}
