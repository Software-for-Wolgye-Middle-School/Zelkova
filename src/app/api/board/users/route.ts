import { connection } from "next/server";
import { deleteUser, handle, listUsers, requireRole } from "@/lib/board";

/** 초대로 가입한 계정 목록 (교사만) */
export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    await requireRole(request, ["teacher"]);
    return { users: await listUsers() };
  });
}

/** 계정 지우기 (교사만): ?id= */
export async function DELETE(request: Request) {
  return handle(async () => {
    const s = await requireRole(request, ["teacher"]);
    await deleteUser(s, new URL(request.url).searchParams.get("id") ?? "");
  });
}
