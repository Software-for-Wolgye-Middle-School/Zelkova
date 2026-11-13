import { NOTICE_BOARD_URL, SCHOOL_SITE } from "./meal";
import { seoulYearMonth } from "./mealNotice";

/**
 * 월계중학교 홈페이지의 공개 게시판(공지사항 · 가정통신문)에서 이번 달 글을 읽어 옴 (서버 전용).
 * 게시판 목록 · 본문은 학교 홈페이지가 AJAX 로 불러오는 주소를 그대로 사용 (급식 안내 읽기와 같은 방식).
 * '월계소식' 게시판은 홈페이지 로그인이 필요해서 읽지 않음. 읽은 글은 서버에 저장하지 않음.
 */

export type Board = { name: string; bbsId: string; url: string };
export const BOARDS: Board[] = [
  { name: "공지사항", bbsId: "BBSMSTR_000000006422", url: `${SCHOOL_SITE}/19712/subMenu.do` },
  { name: "가정통신문", bbsId: "BBSMSTR_000000006423", url: NOTICE_BOARD_URL },
];

export type SchoolPost = { board: string; title: string; date: string; body: string };

const USER_AGENT = "Mozilla/5.0 (compatible; neutinamu-classroom-helper)";

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** 게시판 검색 · 본문 보기는 게시판 화면을 먼저 연 세션에서만 동작함 */
async function session(board: Board) {
  const res = await fetch(board.url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
  await res.body?.cancel();
  if (!res.ok) throw new Error(`학교 홈페이지 응답 오류 (${res.status})`);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function post(board: Board, path: string, form: Record<string, string>, cookie: string) {
  const res = await fetch(`${SCHOOL_SITE}${path}`, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: board.url, Cookie: cookie },
    body: new URLSearchParams(form),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`학교 홈페이지 응답 오류 (${res.status})`);
  return res.text();
}

async function boardPosts(board: Board): Promise<(SchoolPost & { nttId: string })[]> {
  const cookie = await session(board);
  const html = await post(board, "/dggb/module/board/selectBoardListAjax.do", { bbsId: board.bbsId, bbsTyCode: "dliv", customRecordCountPerPage: "20", pageIndex: "1" }, cookie);
  const posts: (SchoolPost & { nttId: string })[] = [];
  for (const row of html.split(/<tr[\s>]/).slice(1)) {
    const link = /fnView\('[^']*',\s*'(\d+)'\);?"\s*>([^<]+)</.exec(row);
    const date = /<td>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/.exec(row);
    if (link && date) posts.push({ board: board.name, nttId: link[1], title: decode(link[2]).trim(), date: date[1], body: "" });
  }
  // 이번 달 글의 본문 (앞부분만)
  const { year, month } = seoulYearMonth();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  for (const p of posts.filter((x) => x.date.startsWith(prefix)).slice(0, 6)) {
    const detail = await post(board, "/dggb/module/board/selectBoardDetailAjax.do", { bbsId: board.bbsId, bbsTyCode: "dliv", nttId: p.nttId }, cookie).catch(() => "");
    const cell = /class="content"[^>]*>([\s\S]*?)<\/(?:td|div)>/.exec(detail)?.[1] ?? "";
    p.body = decode(cell.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 500);
  }
  return posts;
}

/**
 * 이번 달 공지사항 · 가정통신문 (최근 것부터). 이번 달 글이 없으면 가장 최근 글 몇 개 (thisMonth: false).
 * 서버에 저장하지 않고 물어볼 때마다 학교 홈페이지에서 새로 읽음
 */
export async function monthNews(): Promise<{ posts: SchoolPost[]; thisMonth: boolean; year: number; month: number }> {
  const { year, month } = seoulYearMonth();
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const all = (await Promise.all(BOARDS.map((b) => boardPosts(b).catch(() => [])))).flat().sort((a, b) => b.date.localeCompare(a.date));
  if (!all.length) throw new Error("학교 홈페이지에서 글을 읽지 못했어요.");
  const mine = all.filter((p) => p.date.startsWith(key));
  const posts = (mine.length ? mine : all.slice(0, 5)).slice(0, 12).map(({ board, title, date, body }) => ({ board, title, date, body }));
  return { posts, thisMonth: mine.length > 0, year, month };
}
