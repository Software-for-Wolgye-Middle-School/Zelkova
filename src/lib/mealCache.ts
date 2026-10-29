import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { MealNotice } from "./meal";
import { fetchMonthlyMealNotice, seoulYearMonth } from "./mealNotice";

/**
 * 이번 달 급식표를 서버 디스크에 한 번 저장해 두고, 다른 사용자가 열 때는 학교 홈페이지에 다시 가지 않고 바로 돌려줌 (서버 전용).
 * 저장 파일은 달마다 하나(YYYY-MM.json)이며, 달이 바뀌면 지난 달 파일은 지워 저장 공간을 아낌.
 * 저장 위치는 MEAL_CACHE_DIR 환경 변수로 바꿀 수 있고, 기본값은 운영체제 임시 폴더.
 */

const DIR = path.join(process.env.MEAL_CACHE_DIR ?? tmpdir(), "zelkova-meal-cache");
/** 이번 달 식단표를 못 찾아 대신 보여 주는 안내는 오래 두지 않고 곧 다시 확인 */
const FALLBACK_TTL_MS = 60 * 60 * 1000;

type Entry = { month: string; savedAt: number; exact: boolean; notice: MealNotice | null };

const fileOf = (key: string) => path.join(DIR, `${key}.json`);

/** 이번 달 것이 아닌 저장 파일을 모두 지움 */
async function clearOtherMonths(keep: string) {
  const names = await readdir(DIR).catch(() => [] as string[]);
  await Promise.all(names.filter((n) => n !== `${keep}.json`).map((n) => rm(path.join(DIR, n), { force: true, recursive: true }).catch(() => {})));
}

async function readEntry(key: string): Promise<Entry | null> {
  try {
    const entry = JSON.parse(await readFile(fileOf(key), "utf8")) as Entry;
    if (entry.month !== key) return null;
    return entry.exact || Date.now() - entry.savedAt < FALLBACK_TTL_MS ? entry : null;
  } catch {
    return null; // 파일이 없거나 깨진 경우
  }
}

async function writeEntry(entry: Entry) {
  try {
    await mkdir(DIR, { recursive: true });
    // 쓰는 도중에 읽히지 않도록 임시 파일에 쓴 뒤 이름을 바꿈
    const tmp = `${fileOf(entry.month)}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(entry));
    await rename(tmp, fileOf(entry.month));
  } catch (e) {
    console.error("급식표를 저장하지 못했어요 (저장 없이 계속합니다)", e);
  }
}

/** 같은 달 요청이 동시에 와도 학교 홈페이지는 한 번만 읽음 */
const inflight = new Map<string, Promise<MealNotice | null>>();

export function getMonthlyMealNotice(): Promise<MealNotice | null> {
  const { year, month } = seoulYearMonth();
  const key = `${year}-${String(month).padStart(2, "0")}`;
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      await clearOtherMonths(key);
      const cached = await readEntry(key);
      if (cached) return cached.notice;
      const { notice, exact } = await fetchMonthlyMealNotice({ year, month });
      if (notice) await writeEntry({ month: key, savedAt: Date.now(), exact, notice });
      return notice;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}
