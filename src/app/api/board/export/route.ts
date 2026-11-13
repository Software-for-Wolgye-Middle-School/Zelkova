import { connection } from "next/server";
import { exportAll, handle, requireRole } from "@/lib/board";

/** 모든 공지 · 알림장 · 메모 내려받기 (교사만, JSON) */
export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const s = requireRole(request, ["teacher"]);
    const data = await exportAll(s);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="board-export-${data.exportedAt.slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
