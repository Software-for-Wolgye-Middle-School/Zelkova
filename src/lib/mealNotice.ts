import { readHwpTables, type HwpCell, type HwpTable } from "./hwp";
import {
  NOTICE_BOARD_URL,
  SCHOOL_SITE,
  schoolFileUrl,
  type MealCell,
  type MealFile,
  type MealItem,
  type MealNotice,
  type MealTable,
  type MealWeek,
} from "./meal";

/**
 * 월계중학교 가정통신문 게시판에서 급식 안내를 찾아 식단표를 읽어 옴 (서버 전용).
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
  });
  if (!res.ok) throw new Error(`학교 홈페이지 응답 오류 (${res.status})`);
  return res.text();
}

/** 게시판 검색은 게시판 화면을 먼저 연 세션에서만 동작함 */
async function boardSession() {
  const res = await fetch(NOTICE_BOARD_URL, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
  await res.body?.cancel();
  if (!res.ok) throw new Error(`학교 홈페이지 응답 오류 (${res.status})`);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function searchMealPosts() {
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

async function postFiles(nttId: string): Promise<MealFile[]> {
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

async function readMealTables(file: MealFile) {
  if (file.ext !== "hwp") return [];
  const res = await fetch(schoolFileUrl(file.id, file.sn)!, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
  if (!res.ok) return [];
  const tables = readHwpTables(new Uint8Array(await res.arrayBuffer())) ?? [];
  return tables.map(toMealTable).filter((t): t is MealTable => t !== null);
}

// ---------------------------------------------------------------------------
// 식단표 해석: 첫 열이 '요일' · '날짜' · '식단' · '영양량' 인 줄로 이루어진 표

const label = (cell: HwpCell | undefined) => (cell?.lines.join("") ?? "").replace(/\s/g, "");

/** 알레르기 번호는 1~19 */
const ALLERGENS = /^\d{1,2}(?:\.\d{1,2})*\.?$/;
const validAllergens = (s: string) => ALLERGENS.test(s) && s.split(".").filter(Boolean).every((n) => Number(n) >= 1 && Number(n) <= 19);

/** '고등어김치조림5.6.7' → 고등어김치조림 + 5.6.7, 다음 줄에 번호만 있으면 앞 음식에 붙임 */
export function menuItems(lines: string[]): MealItem[] {
  const items: MealItem[] = [];
  for (const line of lines) {
    const compact = line.replace(/\s/g, "");
    if (items.length && validAllergens(compact)) {
      const last = items[items.length - 1];
      last.allergens = last.allergens ? `${last.allergens}.${compact}` : compact;
      continue;
    }
    const m = /^(.*?[^\d.\s])\s*(\d[\d.]*)$/.exec(line);
    if (m && validAllergens(m[2])) items.push({ name: m[1].trim(), allergens: m[2].replace(/\.$/, "") });
    else items.push({ name: line, allergens: "" });
  }
  return items;
}

/** '수♥수요일은 다 먹는날♥' → 수 + 수요일은 다 먹는날, '6 *그린데이*' → 6 + 그린데이 */
function splitHead(text: string, head: RegExp) {
  const m = head.exec(text.trim());
  if (!m) return { main: text.trim(), note: "" };
  return { main: m[0], note: text.trim().slice(m[0].length).replace(/[♥♡*★☆]/g, " ").replace(/\s+/g, " ").trim() };
}

function toMealTable(table: HwpTable): MealTable | null {
  const grid = new Map<number, HwpCell[]>();
  for (const c of table.cells) grid.set(c.row, [...(grid.get(c.row) ?? []), c]);
  const rowLabel = (r: number) => label(grid.get(r)?.find((c) => c.col === 0));
  const rowCells = (r: number) => (grid.get(r) ?? []).filter((c) => c.col > 0).sort((a, b) => a.col - b.col);

  const rows = [...grid.keys()].sort((a, b) => a - b);
  if (!rows.some((r) => rowLabel(r) === "식단")) return null;

  const titleText =
    rows
      .map((r) => grid.get(r)!)
      .find((cells) => cells.length === 1 && cells[0].colSpan > 1)?.[0]
      .lines.join(" ")
      .replace(/[◆◇■□]/g, "")
      .trim() ?? "";
  const ym = /(\d{4})\s*[.년]\s*(\d{1,2})\s*월/.exec(titleText);

  const headRow = rows.find((r) => rowLabel(r) === "요일");
  const weekdayAt = new Map<number, { main: string; note: string }>();
  for (const c of headRow === undefined ? [] : rowCells(headRow)) weekdayAt.set(c.col, splitHead(c.lines.join(" "), /^[월화수목금토일]/));
  const weekdays = [...weekdayAt.values()].map((w) => w.main);
  const firstCol = Math.min(...(weekdayAt.size ? weekdayAt.keys() : [1]));

  const weeks: MealWeek[] = [];
  let dateAt = new Map<number, { main: string; note: string }>();
  for (const r of rows) {
    const kind = rowLabel(r);
    if (kind === "날짜") {
      dateAt = new Map(rowCells(r).map((c) => [c.col, splitHead(c.lines.join(" "), /^\d{1,2}/)]));
    } else if (kind === "식단") {
      const cells: MealCell[] = [];
      for (const c of rowCells(r)) {
        const col = c.col - firstCol + 1;
        if (c.colSpan > 1) {
          if (c.lines.length) cells.push({ kind: "note", col, span: c.colSpan, lines: c.lines });
          continue;
        }
        const date = dateAt.get(c.col) ?? { main: "", note: "" };
        if (!date.main && !c.lines.length) continue;
        const weekday = weekdayAt.get(c.col) ?? { main: "", note: "" };
        cells.push({
          kind: "day",
          col,
          weekday: weekday.main,
          weekdayNote: weekday.note,
          date: date.main,
          dateNote: date.note,
          items: menuItems(c.lines),
        });
      }
      weeks.push({ cells, nutrition: "" });
    } else if (kind === "영양량" && weeks.length) {
      weeks[weeks.length - 1].nutrition = rowCells(r)
        .flatMap((c) => c.lines)
        .join(" ");
    }
  }

  return { title: titleText, year: ym ? Number(ym[1]) : null, month: ym ? Number(ym[2]) : null, weekdays, weeks };
}

/** 가장 최근에 올라온 급식 안내 count 개 */
export async function fetchMealNotices(count = 3): Promise<MealNotice[]> {
  const posts = (await searchMealPosts()).slice(0, count);
  return Promise.all(
    posts.map(async (p) => {
      const files = await postFiles(p.nttId);
      const tables = (await Promise.all(files.map((f) => readMealTables(f).catch(() => [])))).flat();
      return { ...p, files, tables };
    }),
  );
}
