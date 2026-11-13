import { connection } from "next/server";
import { displayName, handle, requireRole, unreadSummary } from "@/lib/board";

/** 지금 로그인한 소통게시판 사용자와 새 글 수 */
export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const s = await requireRole(request, ["teacher", "aide", "sw", "parent"]);
    return { role: s.board, userId: s.userId, name: await displayName(s), unread: await unreadSummary(s) };
  });
}
