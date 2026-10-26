/** 급식 안내 화면과 서버가 함께 쓰는 형식 · 주소 */

export const SCHOOL_SITE = "https://wolgye.sen.ms.kr";
export const NOTICE_BOARD_URL = `${SCHOOL_SITE}/19713/subMenu.do`;

export type MealFile = { name: string; id: string; sn: string; ext: string };
export type MealItem = { name: string; allergens: string };
export type MealCell =
  | { kind: "day"; col: number; weekday: string; weekdayNote: string; date: string; dateNote: string; items: MealItem[] }
  | { kind: "note"; col: number; span: number; lines: string[] };
export type MealWeek = { cells: MealCell[]; nutrition: string };
export type MealTable = { title: string; year: number | null; month: number | null; weekdays: string[]; weeks: MealWeek[] };
export type MealNotice = {
  nttId: string;
  title: string;
  /** 게시일 (YYYY-MM-DD) */
  date: string;
  files: MealFile[];
  tables: MealTable[];
};

/** 원본 첨부 파일 주소 (게시판에 올라온 파일만 허용) */
export function schoolFileUrl(id: string, sn: string) {
  if (!/^FILE_\d+$/.test(id) || !/^\d+$/.test(sn)) return null;
  return `${SCHOOL_SITE}/dggb/board/boardFile/downFile.do?atchFileId=${id}&fileSn=${sn}`;
}
