import { PAPER_COLORS, type PaperColor } from "@/lib/bankbookSvg";

/** 칭찬통장에 쓰려고 직접 올린 앞면 · 뒷면 사진 한 세트. 작게 줄여 브라우저에 저장 */
export type CustomPhotoSet = { id: string; label: string; /** data: 주소 */ front: string; back: string; paper: PaperColor };

const STORAGE_KEY = "zelkova.bankbook.photosets.v3";
export const MAX_PHOTO_SETS = 5;
export const MAX_BACKGROUND_FILE_BYTES = 15 * 1024 * 1024;
/** 저장할 때 줄이는 너비 (표지를 A4 로 크게 인쇄해도 괜찮을 만큼) */
export const BACKGROUND_MAX_WIDTH = 1600;

const isImage = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/");

export function loadPhotoSets(): CustomPhotoSet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as Partial<CustomPhotoSet>[]) : [];
    if (!Array.isArray(data)) return [];
    return data
      .filter((d) => typeof d.id === "string" && isImage(d.front) && isImage(d.back))
      .map((d) => ({
        id: d.id!,
        label: String(d.label ?? "내 사진").slice(0, 12),
        front: d.front!,
        back: d.back!,
        paper: d.paper && d.paper in PAPER_COLORS ? d.paper : "노랑",
      }))
      .slice(0, MAX_PHOTO_SETS);
  } catch {
    return [];
  }
}

/** 저장 공간이 부족하면 false */
export function savePhotoSets(list: CustomPhotoSet[]) {
  try {
    if (list.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export const newPhotoSetId = () => `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
