import { connection } from "next/server";
import { clean, createNotice, deleteNotice, handle, HttpError, listNotices, markNoticeRead, requireRole } from "@/lib/board";

/** 학급 공지 목록 (교사 · 학부모). 교사에게는 읽은 사람 목록도 */
export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const s = await requireRole(request, ["teacher", "parent"]);
    return { notices: await listNotices(s) };
  });
}

/** 공지 쓰기 (교사만): { title, body } */
export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireRole(request, ["teacher"]);
    const b = (await request.json().catch(() => null)) as { title?: unknown; body?: unknown } | null;
    const title = clean(b?.title, 100);
    const body = clean(b?.body, 5000);
    if (!title || !body) throw new HttpError(400, "제목과 내용을 적어 주세요.");
    return { id: await createNotice(s, title, body) };
  });
}

/** 읽음 표시 (학부모 · 교사): { id } */
export async function PATCH(request: Request) {
  return handle(async () => {
    const s = await requireRole(request, ["teacher", "parent"]);
    await markNoticeRead(s, clean(((await request.json().catch(() => null)) as { id?: unknown } | null)?.id, 40));
  });
}

/** 공지 지우기 (교사만): ?id= */
export async function DELETE(request: Request) {
  return handle(async () => {
    const s = await requireRole(request, ["teacher"]);
    await deleteNotice(s, new URL(request.url).searchParams.get("id") ?? "");
  });
}
