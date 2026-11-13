import { connection } from "next/server";
import { addMemo, clean, deleteMemo, handle, HttpError, listMemos, requireRole } from "@/lib/board";

/** 한 학생의 활동 메모 (교사 · 실무사, 사회복무요원은 자기가 쓴 것만): ?student= */
export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const s = requireRole(request, ["teacher", "aide", "sw"]);
    return { memos: await listMemos(s, new URL(request.url).searchParams.get("student") ?? "") };
  });
}

/** 메모 남기기: { studentId, date, body } */
export async function POST(request: Request) {
  return handle(async () => {
    const s = requireRole(request, ["teacher", "aide", "sw"]);
    const b = (await request.json().catch(() => null)) as { studentId?: unknown; date?: unknown; body?: unknown } | null;
    const body = clean(b?.body, 2000);
    if (!body) throw new HttpError(400, "메모를 적어 주세요.");
    await addMemo(s, clean(b?.studentId, 40), clean(b?.date, 10), body);
  });
}

/** 메모 지우기 (교사만): ?student=&id= */
export async function DELETE(request: Request) {
  return handle(async () => {
    const s = requireRole(request, ["teacher"]);
    const q = new URL(request.url).searchParams;
    await deleteMemo(s, q.get("student") ?? "", q.get("id") ?? "");
  });
}
