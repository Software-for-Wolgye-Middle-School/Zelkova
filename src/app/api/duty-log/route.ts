import { connection } from "next/server";
import { isAuthed } from "@/lib/auth";
import { readDutyLog, sanitizeDutyLog, writeDutyLog } from "@/lib/dutyLogStore";

const NO_STORE = { "Cache-Control": "no-store" };
/** 활동일지는 로그인한 사람만 보고 고칠 수 있음 */
const unauthorized = () => Response.json({ error: "로그인이 필요해요." }, { status: 401, headers: NO_STORE });

export async function GET(request: Request) {
  await connection();
  if (!isAuthed(request)) return unauthorized();
  return Response.json({ doc: await readDutyLog() }, { headers: NO_STORE });
}

export async function PUT(request: Request) {
  if (!isAuthed(request)) return unauthorized();
  const body = (await request.json().catch(() => null)) as { updatedAt?: unknown; log?: unknown } | null;
  if (!body || typeof body.updatedAt !== "number" || !Number.isFinite(body.updatedAt)) {
    return Response.json({ error: "updatedAt 과 log 가 필요해요." }, { status: 400 });
  }
  if (!sanitizeDutyLog(body.log)) return Response.json({ error: "활동일지 모양이 맞지 않아요." }, { status: 400 });
  try {
    const { saved, current } = await writeDutyLog(body.updatedAt, body.log);
    return Response.json({ saved, doc: current }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "활동일지를 서버에 저장하지 못했어요." }, { status: 500 });
  }
}
