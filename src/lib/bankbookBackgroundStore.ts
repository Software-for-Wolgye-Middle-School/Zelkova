import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PAPER_COLORS, type PaperColor } from "./bankbookSvg";

/**
 * 칭찬통장에 사람들이 등록한 배경(앞면 · 뒷면 사진 한 세트)을 서버 디스크에 저장해 모든 사용자에게 보여 줌 (서버 전용).
 * 세트마다 파일 하나(<id>.json). 저장 위치는 BANKBOOK_DATA_DIR 환경 변수로 바꿀 수 있고, 기본값은 실행 폴더의 .data
 */

const DIR = path.join(process.env.BANKBOOK_DATA_DIR ?? path.join(process.cwd(), ".data"), "bankbook-backgrounds");
export const MAX_SETS = 20;
/** 사진 하나(data: 주소)의 최대 길이 */
const MAX_IMAGE_CHARS = 6 * 1024 * 1024;

export type StoredSet = { id: string; label: string; front: string; back: string; paper: PaperColor; createdAt: number };

const ID = /^custom-[a-f0-9]{16}$/;
export const isValidId = (id: string) => ID.test(id);
const fileOf = (id: string) => path.join(DIR, `${id}.json`);
const isImage = (v: unknown): v is string => typeof v === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(v) && v.length <= MAX_IMAGE_CHARS;

export async function listSets(): Promise<StoredSet[]> {
  const names = await readdir(DIR).catch(() => [] as string[]);
  const sets = await Promise.all(
    names
      .filter((n) => n.endsWith(".json"))
      .map(async (n) => {
        try {
          const s = JSON.parse(await readFile(path.join(DIR, n), "utf8")) as StoredSet;
          return isValidId(s.id) && isImage(s.front) && isImage(s.back) ? s : null;
        } catch {
          return null; // 깨진 파일
        }
      }),
  );
  return sets.filter((s): s is StoredSet => !!s).sort((a, b) => a.createdAt - b.createdAt);
}

/** 입력이 올바르면 저장하고 돌려주고, 아니면 사용자에게 보여 줄 오류 문장을 돌려줌 */
export async function addSet(input: unknown): Promise<{ set: StoredSet } | { error: string; status: number }> {
  const b = (input ?? {}) as Record<string, unknown>;
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 12) : "";
  if (!label) return { error: "배경 이름을 입력해 주세요.", status: 400 };
  if (!isImage(b.front) || !isImage(b.back)) return { error: "앞면 · 뒷면 사진이 올바르지 않아요.", status: 400 };
  const paper = typeof b.paper === "string" && b.paper in PAPER_COLORS ? (b.paper as PaperColor) : "노랑";
  if ((await listSets()).length >= MAX_SETS) return { error: `등록한 배경이 ${MAX_SETS}개로 가득 찼어요. 안 쓰는 배경을 지워 주세요.`, status: 409 };

  const set: StoredSet = { id: `custom-${randomBytes(8).toString("hex")}`, label, front: b.front, back: b.back, paper, createdAt: Date.now() };
  await mkdir(DIR, { recursive: true });
  // 쓰는 도중에 읽히지 않도록 임시 파일에 쓴 뒤 이름을 바꿈
  const tmp = `${fileOf(set.id)}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(set));
  await rename(tmp, fileOf(set.id));
  return { set };
}

export async function removeSet(id: string) {
  if (isValidId(id)) await rm(fileOf(id), { force: true });
}
