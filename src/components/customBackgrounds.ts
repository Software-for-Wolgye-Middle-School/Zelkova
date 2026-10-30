import type { PaperColor } from "@/lib/bankbookSvg";

/** 칭찬통장에 등록한 앞면 · 뒷면 사진 한 세트. 서버에 저장되어 모든 사용자가 같이 씀 */
export type CustomPhotoSet = { id: string; label: string; /** data: 주소 */ front: string; back: string; paper: PaperColor };

const API = "/api/bankbook/backgrounds";
export const MAX_PHOTO_SETS = 20;
export const MAX_BACKGROUND_FILE_BYTES = 15 * 1024 * 1024;
/** 서버로 보내기 전에 줄이는 너비 (표지를 A4 로 크게 인쇄해도 괜찮을 만큼) */
export const BACKGROUND_MAX_WIDTH = 1600;

export async function fetchPhotoSets(): Promise<CustomPhotoSet[]> {
  const res = await fetch(API, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 실패하면 서버가 알려 준 문장을 담은 Error 를 던짐 */
export async function registerPhotoSet(set: Omit<CustomPhotoSet, "id">): Promise<CustomPhotoSet> {
  const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(set) });
  if (!res.ok) throw new Error((await res.text()) || "서버에 저장하지 못했어요.");
  return res.json();
}

export async function deletePhotoSet(id: string) {
  const res = await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error((await res.text()) || "지우지 못했어요.");
}
