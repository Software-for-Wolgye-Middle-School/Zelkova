import { isAuthed } from "@/lib/auth";
import { sanitizeEvent } from "@/lib/dutyEvents";
import { writeDutyEvent } from "@/lib/dutyLogStore";

const NO_STORE = { "Cache-Control": "no-store" };

/** 달력 일정 하나를 저장 (event 가 null 이면 지운 것으로 표시) */
export async function PUT(request: Request) {
  if (!isAuthed(request)) return Response.json({ error: "로그인이 필요해요." }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { id?: unknown; updatedAt?: unknown; event?: unknown } | null;
  if (
    !body ||
    typeof body.id !== "string" ||
    typeof body.updatedAt !== "number" ||
    !Number.isFinite(body.updatedAt) ||
    (body.event !== null && !sanitizeEvent(body.event))
  ) {
    return Response.json({ error: "id, updatedAt, event(또는 null)가 필요해요." }, { status: 400 });
  }
  try {
    const { saved, current } = await writeDutyEvent(body.id, body.updatedAt, body.event);
    return Response.json({ saved, doc: current }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "일정을 서버에 저장하지 못했어요." }, { status: 500 });
  }
}
