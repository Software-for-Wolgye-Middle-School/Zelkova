import { randomBytes } from "node:crypto";
import { del, list, put } from "@vercel/blob";
import { PAPER_COLORS, type PaperColor } from "./bankbookSvg";

/**
 * 칭찬통장에 사람들이 등록한 배경(앞면 · 뒷면 사진 한 세트)을 Vercel Blob 에 저장해 모든 사용자에게 보여 줌 (서버 전용).
 * Vercel 서버는 파일을 쓸 수 없으므로 디스크 대신 Blob 저장소를 씀 (프로젝트의 Storage 에서 Blob 을 만들어 연결해야 함).
 * 세트마다 bankbook-backgrounds/<id>/ 아래에 meta.json · front.* · back.* 가 있고, meta.json 이 가장 나중에 만들어지므로
 * 올리는 도중인 세트는 목록에 나오지 않음.
 */

const PREFIX = "bankbook-backgrounds/";
export const MAX_SETS = 20;
/** 사진 하나(data: 주소)의 최대 길이 */
const MAX_IMAGE_CHARS = 6 * 1024 * 1024;

type Meta = { id: string; label: string; paper: PaperColor; createdAt: number };
/** 사진은 같은 서버 주소(/api/…)로 내려 줌 (브라우저가 PDF 로 만들 때 그림을 읽을 수 있어야 하므로) */
export type StoredSet = Meta & { front: string; back: string };

const ID = /^custom-[a-f0-9]{16}$/;
export const isValidId = (id: string) => ID.test(id);
export const isSide = (s: string): s is "front" | "back" => s === "front" || s === "back";
const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,/;
const isImage = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_IMAGE_CHARS && DATA_URL.test(v);
const withUrls = (m: Meta): StoredSet => ({ ...m, front: `/api/bankbook/backgrounds/${m.id}/front`, back: `/api/bankbook/backgrounds/${m.id}/back` });

async function listMetas(): Promise<Meta[]> {
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  const metas = await Promise.all(
    blobs
      .filter((b) => b.pathname.endsWith("/meta.json"))
      .map(async (b) => {
        try {
          const m = (await (await fetch(b.url, { cache: "no-store" })).json()) as Meta;
          return isValidId(m.id) ? m : null;
        } catch {
          return null; // 깨진 파일
        }
      }),
  );
  return metas.filter((m): m is Meta => !!m).sort((a, b) => a.createdAt - b.createdAt);
}

export async function listSets(): Promise<StoredSet[]> {
  return (await listMetas()).map(withUrls);
}

/** 입력이 올바르면 저장하고 돌려주고, 아니면 사용자에게 보여 줄 오류 문장을 돌려줌 */
export async function addSet(input: unknown): Promise<{ set: StoredSet } | { error: string; status: number }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { error: "서버 저장소(Vercel Blob)가 아직 연결되지 않았어요.", status: 503 };
  const b = (input ?? {}) as Record<string, unknown>;
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 12) : "";
  if (!label) return { error: "배경 이름을 입력해 주세요.", status: 400 };
  if (!isImage(b.front) || !isImage(b.back)) return { error: "앞면 · 뒷면 사진이 올바르지 않아요.", status: 400 };
  const paper = typeof b.paper === "string" && b.paper in PAPER_COLORS ? (b.paper as PaperColor) : "노랑";
  if ((await listMetas()).length >= MAX_SETS) return { error: `등록한 배경이 ${MAX_SETS}개로 가득 찼어요. 안 쓰는 배경을 지워 주세요.`, status: 409 };

  const meta: Meta = { id: `custom-${randomBytes(8).toString("hex")}`, label, paper, createdAt: Date.now() };
  const upload = (side: "front" | "back", dataUrl: string) => {
    const mime = DATA_URL.exec(dataUrl)![1];
    const body = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    return put(`${PREFIX}${meta.id}/${side}.${mime.split("/")[1]}`, body, { access: "public", addRandomSuffix: false, contentType: mime });
  };
  await Promise.all([upload("front", b.front), upload("back", b.back)]);
  await put(`${PREFIX}${meta.id}/meta.json`, JSON.stringify(meta), { access: "public", addRandomSuffix: false, contentType: "application/json" });
  return { set: withUrls(meta) };
}

/** 앞면 또는 뒷면 사진을 저장소에서 받아 그대로 돌려줌. 없으면 null */
export async function getImage(id: string, side: "front" | "back"): Promise<Response | null> {
  if (!isValidId(id)) return null;
  const { blobs } = await list({ prefix: `${PREFIX}${id}/${side}.`, limit: 1 });
  if (!blobs[0]) return null;
  const res = await fetch(blobs[0].url);
  return res.ok ? res : null;
}

export async function removeSet(id: string) {
  if (!isValidId(id)) return;
  const { blobs } = await list({ prefix: `${PREFIX}${id}/`, limit: 10 });
  if (blobs.length) await del(blobs.map((b) => b.url));
}
