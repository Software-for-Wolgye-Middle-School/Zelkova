import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { GRADES, SUBJECTS } from "@/components/students";

/**
 * 학생 정보를 서버 디스크의 JSON 파일 하나(students.json)에 저장해 모든 사용자가 같이 쓰는 작은 저장소 (서버 전용).
 * 학생이 수백 명 수준이라 파일 하나를 통째로 읽고 쓰는 편이 DB나 여러 파일보다 단순하고 빠름.
 * 쓰는 도중에 읽히거나 깨지지 않도록 임시 파일에 쓴 뒤 이름을 바꾸고, 동시에 온 저장 요청은 차례대로 처리함.
 * 저장 위치: Upstash Redis(Vercel 등 서버리스 배포)의 REST 주소와 토큰 환경 변수가 있으면 거기에 JSON 한 덩어리로 저장하고,
 * 없으면 서버 디스크(STUDENTS_DATA_DIR, 기본값은 프로젝트의 data 폴더)의 파일에 저장함.
 */

export type StoredStudent = { grade: string; cls: string; name: string; subjects: string[] };

const FILE = path.join(process.env.STUDENTS_DATA_DIR ?? path.join(process.cwd(), "data"), "students.json");
const MAX_STUDENTS = 2000;

// Vercel Marketplace 의 Upstash(KV_REST_API_*) 또는 Upstash 직접 연결(UPSTASH_REDIS_REST_*) 환경 변수
const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = "zelkova:students";

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

/** 올바른 학생만 골라 같은 학년 · 반 · 이름의 중복을 없애고 정리함 */
export function sanitizeStudents(input: unknown): StoredStudent[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: StoredStudent[] = [];
  for (const d of input.slice(0, MAX_STUDENTS) as Partial<StoredStudent>[]) {
    const grade = String(d?.grade);
    const cls = Number(d?.cls);
    const name = String(d?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 10);
    const subjects = SUBJECTS.filter((s) => Array.isArray(d?.subjects) && d.subjects.includes(s));
    if (!GRADES.includes(grade) || !Number.isInteger(cls) || cls < 1 || cls > 30 || !name || subjects.length === 0) continue;
    const key = `${grade}|${cls}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ grade, cls: String(cls), name, subjects });
  }
  return out;
}

export async function readStudents(): Promise<StoredStudent[]> {
  try {
    const raw = REDIS_URL && REDIS_TOKEN ? await redis(["GET", REDIS_KEY]) : await readFile(FILE, "utf8");
    if (typeof raw !== "string") return [];
    const data = JSON.parse(raw) as { students?: unknown };
    return sanitizeStudents(data.students);
  } catch {
    return []; // 파일이 아직 없거나 깨진 경우
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** 학생 목록 전체를 바꿔 저장하고, 정리된 목록을 돌려줌 */
export function writeStudents(input: unknown): Promise<StoredStudent[]> {
  const students = sanitizeStudents(input);
  const job = queue.then(async () => {
    if (REDIS_URL && REDIS_TOKEN) {
      await redis(["SET", REDIS_KEY, JSON.stringify({ updatedAt: Date.now(), students })]);
      return students;
    }
    await mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ updatedAt: Date.now(), students }, null, 2), "utf8");
    await rename(tmp, FILE);
    return students;
  });
  queue = job.catch(() => {}); // 한 번 실패해도 다음 저장은 계속 처리
  return job;
}
