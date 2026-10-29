/** 이름표에 쓰려고 직접 등록한 이모티콘. 그림은 작게 줄여 브라우저에 저장 */
export type CustomIcon = { id: string; label: string; /** data: 주소 */ art: string };

const STORAGE_KEY = "zelkova.nametag.icons.v1";
export const MAX_CUSTOM_ICONS = 12;
/** 그림 파일 하나의 최대 크기 (너무 큰 파일은 줄이기 전에 막음) */
export const MAX_ICON_FILE_BYTES = 10 * 1024 * 1024;

export function loadCustomIcons(): CustomIcon[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as Partial<CustomIcon>[]) : [];
    if (!Array.isArray(data)) return [];
    return data
      .filter((d) => typeof d.id === "string" && typeof d.art === "string" && d.art.startsWith("data:image/"))
      .map((d) => ({ id: d.id!, label: String(d.label ?? "내 이모티콘").slice(0, 12), art: d.art! }))
      .slice(0, MAX_CUSTOM_ICONS);
  } catch {
    return [];
  }
}

/** 저장 공간이 부족하면 false */
export function saveCustomIcons(icons: CustomIcon[]) {
  try {
    if (icons.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export const newIconId = () => `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
