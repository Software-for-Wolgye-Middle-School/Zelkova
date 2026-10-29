/** 칭찬통장 표지 · 뒤표지에 쓰려고 직접 올린 배경 사진. 작게 줄여 브라우저에 저장 */
export type CustomBackground = { id: string; label: string; /** data: 주소 */ art: string };

const STORAGE_KEY = "zelkova.bankbook.backgrounds.v1";
export const MAX_CUSTOM_BACKGROUNDS = 6;
export const MAX_BACKGROUND_FILE_BYTES = 15 * 1024 * 1024;
/** 저장할 때 줄이는 너비 (표지를 A4 로 크게 인쇄해도 괜찮을 만큼) */
export const BACKGROUND_MAX_WIDTH = 1600;

export function loadCustomBackgrounds(): CustomBackground[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as Partial<CustomBackground>[]) : [];
    if (!Array.isArray(data)) return [];
    return data
      .filter((d) => typeof d.id === "string" && typeof d.art === "string" && d.art.startsWith("data:image/"))
      .map((d) => ({ id: d.id!, label: String(d.label ?? "내 사진").slice(0, 12), art: d.art! }))
      .slice(0, MAX_CUSTOM_BACKGROUNDS);
  } catch {
    return [];
  }
}

/** 저장 공간이 부족하면 false */
export function saveCustomBackgrounds(list: CustomBackground[]) {
  try {
    if (list.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export const newBackgroundId = () => `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
