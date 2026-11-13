import { NOTICE_BOARD_URL, SCHOOL_SITE, schoolFileUrl, type MealFile, type MealLink } from "./meal";

/**
 * 월계중학교 가정통신문 게시판에서 이번 달 급식 안내 글을 찾아 그 링크만 알려 줌 (서버 전용).
 * 식단표 파일을 내려받거나 읽지 않고, 서버에 아무것도 저장하지 않음 (물어볼 때마다 새로 검색).
 * 게시판 목록 · 본문은 학교 홈페이지가 AJAX 로 불러오는 주소를 그대로 사용.
 */

const BBS_ID = "BBSMSTR_000000006423";
const USER_AGENT = "Mozilla/5.0 (compatible; neutinamu-classroom-helper)";

/** 우유급식 조사 · 급식 지원 신청 같은 글은 빼고 달마다 올라오는 급식 안내만 */
const isMonthlyMealNotice = (title: string) =>
  /\d{1,2}\s*월/.test(title) && /급식|식단/.test(title) && !/우유|희망|조사|신청|지원|모니터링|건의/.test(title);

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

async function post(path: string, form: Record<string, string>, cookie?: string) {
  const res = await fetch(`${SCHOOL_SITE}${path}`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: NOTICE_BOARD_URL,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: new URLSearchParams(form),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000), // 학교 홈페이지가 응답하지 않으면 오래 기다리지 않음
  });
  if (!res.ok) throw new Error(`학교 홈페이지 응답 오류 (${res.status})`);
  return res.text();
}

/** 게시판 검색은 게시판 화면을 먼저 연 세션에서만 동작함 */
async function boardSession() {
  const res = await fetch(NOTICE_BOARD_URL, { headers: { "User-Agent": USER_AGENT }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  // 본문은 쓰지 않지만 끝까지 읽어 버림 (중간에 끊으면 같은 연결의 다음 요청이 오래 멈춤)
  await res.arrayBuffer().catch(() => undefined);
  if (!res.ok) throw new Error(`학교 홈페이지 응답 오류 (${res.status})`);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** 가정통신문 게시판에서 달마다 올라오는 급식 안내 글 목록 (최근 것부터, 저장하지 않고 그때그때 검색) */
export async function searchMealPosts() {
  const cookie = await boardSession();
  const html = await post(
    "/dggb/module/board/selectBoardListAjax.do",
    {
      bbsId: BBS_ID,
      bbsTyCode: "dliv",
      customRecordCountPerPage: "30",
      pageIndex: "1",
      searchCondition: "1", // 제목
      searchKeyword: "급식",
    },
    cookie,
  );
  const posts: { nttId: string; title: string; date: string }[] = [];
  for (const row of html.split(/<tr[\s>]/).slice(1)) {
    const link = /fnView\('[^']*',\s*'(\d+)'\);?"\s*>([^<]+)</.exec(row);
    const date = /<td>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/.exec(row);
    if (link && date) posts.push({ nttId: link[1], title: decodeEntities(link[2]).trim(), date: date[1] });
  }
  return posts.filter((p) => isMonthlyMealNotice(p.title)).sort((a, b) => b.date.localeCompare(a.date) || Number(b.nttId) - Number(a.nttId));
}

/** 글의 첨부 파일 (저장하지 않고 그때그때 읽음) */
export async function postFiles(nttId: string): Promise<MealFile[]> {
  const html = await post("/dggb/module/board/selectBoardDetailAjax.do", { bbsId: BBS_ID, bbsTyCode: "dliv", nttId });
  const files: MealFile[] = [];
  // serverFileObj["name"] = "..."; ... serverFileObj["atchFileId"] = "..."; serverFileObj["fileSn"] = "...";
  for (const block of html.split("new Object()").slice(1)) {
    const field = (key: string) => new RegExp(`serverFileObj\\["${key}"\\]\\s*=\\s*"([^"]*)"`).exec(block)?.[1];
    const name = field("name");
    const id = field("atchFileId");
    const sn = field("fileSn");
    if (name && id && sn && schoolFileUrl(id, sn)) {
      files.push({ name: decodeEntities(name), id, sn, ext: name.split(".").pop()!.toLowerCase() });
    }
  }
  return files;
}

/** 한국 시간 기준의 지금 연 · 월 */
export function seoulYearMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).formatToParts(now);
  const num = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: num("year"), month: num("month") };
}

/**
 * 이번 달 급식 안내 가정통신문과 첨부 파일의 학교 홈페이지 주소.
 * 제목에 이번 달이 들어간 글(예: '2026년 11월 급식 안내', '12월 ~ 1월 급식 안내')을 찾고, 없으면 가장 최근 급식 안내.
 * 급식 안내가 하나도 없으면 null
 */
export async function findMonthlyMealLink(): Promise<MealLink | null> {
  const posts = await searchMealPosts();
  const { year, month } = seoulYearMonth();
  const monthRe = new RegExp(`(^|[^0-9])${month}\\s*월`);
  const mine = posts.find((p) => monthRe.test(p.title) && (!/\d{4}\s*년/.test(p.title) || p.title.includes(String(year))));
  const post = mine ?? posts[0];
  if (!post) return null;
  const files = (await postFiles(post.nttId).catch(() => []))
    .map((f) => ({ name: f.name, ext: f.ext, url: schoolFileUrl(f.id, f.sn) }))
    .filter((f): f is { name: string; ext: string; url: string } => !!f.url);
  return { title: post.title, date: post.date, thisMonth: !!mine, files };
}
