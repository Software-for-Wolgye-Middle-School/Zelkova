import { connection } from "next/server";
import { approveMessage, clean, deleteMessage, handle, HttpError, listThread, markMessagesRead, postMessage, requireRole } from "@/lib/board";

/** 한 학생의 알림장 (교사 · 실무사는 모든 학생, 학부모는 자기 자녀의 보낸 글만, 사회복무요원은 못 봄): ?student= */
export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const s = await requireRole(request, ["teacher", "aide", "parent"]);
    return { messages: await listThread(s, new URL(request.url).searchParams.get("student") ?? "") };
  });
}

/** 글쓰기: 교사는 바로 보냄 · 실무사는 초안(교사가 보내야 학부모에게 보임) · 학부모는 답글. { studentId, body } */
export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireRole(request, ["teacher", "aide", "parent"]);
    const b = (await request.json().catch(() => null)) as { studentId?: unknown; body?: unknown } | null;
    const body = clean(b?.body, 5000);
    if (!body) throw new HttpError(400, "내용을 적어 주세요.");
    return { id: await postMessage(s, clean(b?.studentId, 40), body) };
  });
}

/** { action: "approve", id, body? } 초안 보내기 (교사만) · { action: "read", studentId, ids } 읽음 표시 */
export async function PATCH(request: Request) {
  return handle(async () => {
    const b = (await request.json().catch(() => null)) as { action?: unknown; id?: unknown; body?: unknown; studentId?: unknown; ids?: unknown } | null;
    if (b?.action === "approve") {
      const s = await requireRole(request, ["teacher"]);
      const body = clean(b.body, 5000);
      return approveMessage(s, clean(b.id, 40), body || undefined);
    }
    if (b?.action === "read") {
      const s = await requireRole(request, ["teacher", "aide", "parent"]);
      return markMessagesRead(s, clean(b.studentId, 40), Array.isArray(b.ids) ? b.ids.map((v) => clean(v, 40)) : []);
    }
    await requireRole(request, ["teacher", "aide", "parent"]);
    throw new HttpError(400, "action 이 필요해요.");
  });
}

/** 글 지우기 (교사만): ?id= */
export async function DELETE(request: Request) {
  return handle(async () => {
    const s = await requireRole(request, ["teacher"]);
    await deleteMessage(s, new URL(request.url).searchParams.get("id") ?? "");
  });
}
