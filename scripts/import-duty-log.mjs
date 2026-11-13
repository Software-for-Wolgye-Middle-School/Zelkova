// 활동일지 한꺼번에 등록: 주별 내용이 담긴 JSON 파일을 활동일지 저장소(dutyLogStore 와 같은 곳)에 넣음.
// 사용: node scripts/import-duty-log.mjs [파일 경로=data/duty-log-2025.json] [--force]
//   - 기본: 이미 내용이 있는 주는 건드리지 않고 빈 주만 채움. --force 면 모두 덮어씀.
//   - KV_REST_API_URL / KV_REST_API_TOKEN (또는 UPSTASH_REDIS_REST_*) 가 환경에 있으면 거기에, 없으면 data/dutylog.json 에 저장.
// JSON 한 줄 = [시작일, 끝날짜, 서명여부, [월~금 요일별 체크한 항목 번호 0~8], [월~금 비고]]
//   항목 번호: 0 등교 · 1 교수학습 · 2 이동수업 · 3 신변처리 · 4 급식 · 5 교내외 활동 · 6 교재교구 · 7 학급 환경 · 8 하교
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const force = args.includes("--force");
const src = args.find((a) => !a.startsWith("--")) ?? "data/duty-log-2025.json";
const dataDir = process.env.STUDENTS_DATA_DIR ?? path.join(process.cwd(), "data");
const FILE = path.join(dataDir, "dutylog.json");
const URL_ = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "zelkova:dutylog";
const useRedis = !!(URL_ && TOKEN);

async function redis(command) {
  const res = await fetch(URL_, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(command) });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? `Redis ${res.status}`);
  return data.result;
}

const parseIso = (iso) => new Date(...[Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))]);
const pad = (n) => String(n).padStart(2, "0");
const mondayOf = (iso) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const rows = JSON.parse(await readFile(src, "utf8"));

let raw = null;
try {
  raw = useRedis ? await redis(["GET", KEY]) : await readFile(FILE, "utf8");
} catch (e) {
  if (e.code !== "ENOENT") throw e; // 읽지 못했는데 덮어쓰면 기존 기록이 사라지므로 중단
}
const doc = typeof raw === "string" ? JSON.parse(raw) : {};
doc.weeks ??= {};
doc.events ??= {};

const hasEntries = (log) => log.signed || log.checks.some(Boolean) || log.notes.some((n) => String(n).trim());
const now = Date.now();
let added = 0;
let skipped = 0;
for (const [start, end, signed, days, notes] of rows) {
  const key = mondayOf(start);
  if (key !== start) throw new Error(`${start} 는 월요일이 아니에요.`);
  if (days.length !== 5 || notes.length !== 5) throw new Error(`${start}: 요일이 5개여야 해요.`);
  const checks = Array(45).fill(false);
  days.forEach((items, d) => items.forEach((i) => (checks[d * 9 + i] = true)));
  const existing = doc.weeks[key];
  if (existing && hasEntries(existing.log) && !force) {
    skipped++;
    continue;
  }
  doc.weeks[key] = { updatedAt: now, log: { start, end, checks, notes: notes.map((n) => n.slice(0, 80)), signed } };
  added++;
}

const body = JSON.stringify(doc);
if (useRedis) {
  await redis(["SET", KEY, body]);
} else {
  await mkdir(dataDir, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, FILE);
}
console.log(`${useRedis ? "Redis" : FILE} 에 ${added}주 등록, ${skipped}주는 이미 내용이 있어 건너뜀 (전체 ${Object.keys(doc.weeks).length}주).`);
