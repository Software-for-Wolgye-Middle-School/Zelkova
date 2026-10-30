/** 칭찬통장에 쓰려고 직접 올린 사진. 앞면 · 뒷면 두 장을 작게 줄여 브라우저에 저장 */
export type CustomPhotos = { front: string | null; back: string | null; /** data: 주소 */ };

const STORAGE_KEY = "zelkova.bankbook.photos.v2";
export const MAX_BACKGROUND_FILE_BYTES = 15 * 1024 * 1024;
/** 저장할 때 줄이는 너비 (표지를 A4 로 크게 인쇄해도 괜찮을 만큼) */
export const BACKGROUND_MAX_WIDTH = 1600;

export const NO_PHOTOS: CustomPhotos = { front: null, back: null };

const isImage = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/");

export function loadCustomPhotos(): CustomPhotos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as Partial<CustomPhotos>) : {};
    return { front: isImage(data?.front) ? data.front : null, back: isImage(data?.back) ? data.back : null };
  } catch {
    return NO_PHOTOS;
  }
}

/** 저장 공간이 부족하면 false */
export function saveCustomPhotos(photos: CustomPhotos) {
  try {
    if (photos.front || photos.back) localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
