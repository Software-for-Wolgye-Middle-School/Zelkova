/** 급식 안내 화면과 서버가 함께 쓰는 형식 · 주소 */

export const SCHOOL_SITE = "https://wolgye.sen.ms.kr";
export const NOTICE_BOARD_URL = `${SCHOOL_SITE}/19713/subMenu.do`;

export type MealFile = { name: string; id: string; sn: string; ext: string };

/** 이번 달 급식 안내 가정통신문의 링크들 (thisMonth 가 false 면 이번 달 글이 아직 없어 가장 최근 글) */
export type MealLink = {
  title: string;
  /** 게시일 (YYYY-MM-DD) */
  date: string;
  thisMonth: boolean;
  /** 첨부 파일의 학교 홈페이지 주소 */
  files: { name: string; ext: string; url: string }[];
};

/** 원본 첨부 파일 주소 (게시판에 올라온 파일만 허용) */
export function schoolFileUrl(id: string, sn: string) {
  if (!/^FILE_\d+$/.test(id) || !/^\d+$/.test(sn)) return null;
  return `${SCHOOL_SITE}/dggb/board/boardFile/downFile.do?atchFileId=${id}&fileSn=${sn}`;
}
