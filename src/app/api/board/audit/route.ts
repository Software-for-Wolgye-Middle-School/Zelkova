import { connection } from "next/server";
import { handle, readAudit, requireRole } from "@/lib/board";

/** 그날의 감사 기록 (교사만): ?date=YYYY-MM-DD */
export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    requireRole(request, ["teacher"]);
    return { rows: await readAudit(new URL(request.url).searchParams.get("date") ?? "") };
  });
}
