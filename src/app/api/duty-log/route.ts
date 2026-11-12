import { connection } from "next/server";
import { isAuthed } from "@/lib/auth";
import { mondayOf } from "@/lib/dutyLogSvg";
import { isWeekKey, readDutyDoc, sanitizeDutyLog, writeDutyWeek } from "@/lib/dutyLogStore";

const NO_STORE = { "Cache-Control": "no-store" };
/** 활동일지는 로그인한 사람만 보고 고칠 수 있음 */
const unauthorized = () => Response.json({ error: "로그인이 필요해요." }, { status: 401, headers: NO_STORE });

/** 저장된 모든 활동일지(주의 월요일 날짜 → 내용)와 달력 일정(id → 일정) */
export async function GET(request: Request) {
  await connection();
  if (!isAuthed(request)) return unauthorized();
  return Response.json(await readDutyDoc(), { headers: NO_STORE });
}

/** 한 주의 활동일지를 저장 */
export async function PUT(request: Request) {
  if (!isAuthed(request)) return unauthorized();
  const body = (await request.json().catch(() => null)) as { key?: unknown; updatedAt?: unknown; log?: unknown } | null;
  if (!body || !isWeekKey(body.key) || mondayOf(body.key) !== body.key || typeof body.updatedAt !== "number" || !Number.isFinite(body.updatedAt) || !sanitizeDutyLog(body.log)) {
    return Response.json({ error: "key(주의 월요일 날짜), updatedAt, log 가 필요해요." }, { status: 400 });
  }
  try {
    const { saved, current } = await writeDutyWeek(body.key, body.updatedAt, body.log);
    return Response.json({ saved, doc: current }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "활동일지를 서버에 저장하지 못했어요." }, { status: 500 });
  }
}
